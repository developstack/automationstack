import {
	type AttachmentScope,
	prepareRunAttachmentUploads,
} from "@automationstack/db/repositories/test-run-attachments-repository";
import type { User } from "@automationstack/db/schema/users";

import type { RealtimeActor } from "../../realtime/protocol";
import { getR2Storage, type R2Storage } from "../r2";
import { publishInvalidateAs } from "../realtime-publish";
import type {
	IngestAttachmentRegistered,
	IngestAttachmentRegisterReceipt,
	IngestAttachmentRegisterRejection,
	IngestAttachmentRegisterRequest,
} from "./attachment-contract";
import {
	type AttachmentRegisterGroup,
	buildRegisterRejections,
	describeRunCaseVanished,
	describeRunUnwritable,
	groupRegisterItemsByRunId,
	REASON_STORAGE_UNCONFIGURED,
} from "./attachment-reconcile";
import { type RegisterOne, registerOne } from "./attachment-register-one";
import { splitRegisterGroupsByAccess } from "./attachment-register-scope";
import { forbiddenRunIds } from "./ingest-project-access";

/**
 * `POST /ingest/attachments/register` 的**编排**（plan §5.6）：按任务过守卫、
 * 分批登记、按任务发失效事件。
 *
 * 本文件 import 了 db repository，**因此不可单测**（api 的 vitest project
 * 没有 `DATABASE_URL`）。会写错的判断（对象校验的顺序、按任务分组、逐条拒绝）
 * 全在 `./attachment-reconcile` 及其兄弟模块，那边是纯的、有单测；
 * 单条的登记在 `./attachment-register-one`。HTTP 入口在 `./attachment-uploads`。
 */

export type IngestAttachmentRegisterOutcome =
	| { kind: "invalid-payload"; message: string }
	| { kind: "ok"; receipt: IngestAttachmentRegisterReceipt }
	| { kind: "unauthorized" };

/**
 * 与 `./execution-ingest` 的 `ingestActor` 同一个 clientId。
 *
 * 名字是真人：执行台上看到的是「张三」的脚本传了附件，不是「系统」。
 * clientId 固定成一个不可能与真实客户端相同的值（真实的是每 Tab 一个 uuid），
 * 于是没有任何在线页面会把这条事件当成「自己触发的」而跳过刷新。
 *
 * 那边的同名函数是私有的，这里重写一遍而不是去改一个已验收的文件；
 * 两处必须保持同一个 clientId，分叉的表现是「有人的页面永远停在旧附件列表」。
 */
function attachmentIngestActor(user: User): RealtimeActor {
	return { clientId: "automation-ingest", name: user.username };
}

/** 存储未配置时的降级对账单：一行都不登记，但逐条说明原因。 */
function unconfiguredRegisterReceipt(
	request: IngestAttachmentRegisterRequest
): IngestAttachmentRegisterReceipt {
	return {
		registered: [],
		rejected: request.attachments.map((item, index) => ({
			index,
			reason: REASON_STORAGE_UNCONFIGURED,
			runCaseId: item.runCaseId,
			storageKey: item.storageKey,
		})),
		storageConfigured: false,
	};
}

/**
 * 登记阶段的并发上限。
 *
 * 每条都要一次 `HeadObject`（网络往返）加一个短事务，串行跑 500 条要几十秒，
 * 全并发又会在连接池上排出几百个同时挂起的事务、并把同一把 `test_runs`
 * 行锁抢成一条长队。8 是个保守的中间值：把往返延迟摊掉一个数量级，
 * 同时不至于独占连接池——这条路径与人在界面上的操作共用同一个池。
 */
const REGISTER_CONCURRENCY = 8;

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let start = 0; start < items.length; start += size) {
		chunks.push(items.slice(start, start + size));
	}
	return chunks;
}

interface RegisteredGroup {
	projectId: string | null;
	registered: IngestAttachmentRegistered[];
	rejected: IngestAttachmentRegisterRejection[];
}

interface PendingSplit {
	pending: RegisterOne[];
	rejected: IngestAttachmentRegisterRejection[];
}

/**
 * 守卫事务里查不到归属的用例行逐条拒绝，其余的攒成待办。
 *
 * 与 presign 那一侧的 `splitSignableItems` 同因：presign 与 register 之间有人
 * 改了任务的用例范围，这一行就没了。静默跳过等于对象躺在 bucket 里、
 * 库里却没有任何行指向它，而没人知道。
 */
function splitRegisterPending(
	group: AttachmentRegisterGroup,
	scopeByRunCaseId: Map<string, AttachmentScope>,
	storage: R2Storage,
	userId: string
): PendingSplit {
	const pending: RegisterOne[] = [];
	const rejected: IngestAttachmentRegisterRejection[] = [];
	for (const item of group.items) {
		const scope = scopeByRunCaseId.get(item.runCaseId);
		if (scope === undefined) {
			rejected.push(
				...buildRegisterRejections([item], describeRunCaseVanished(null))
			);
			continue;
		}
		pending.push({ item, scope, storage, userId });
	}
	return { pending, rejected };
}

async function registerGroup(
	group: AttachmentRegisterGroup,
	storage: R2Storage,
	userId: string
): Promise<RegisteredGroup> {
	const prepared = await prepareRunAttachmentUploads({
		runCaseIds: group.items.map((item) => item.runCaseId),
		runId: group.runId,
	});
	if (prepared.kind !== "ok") {
		return {
			projectId: null,
			registered: [],
			rejected: buildRegisterRejections(
				group.items,
				describeRunUnwritable(prepared, null)
			),
		};
	}
	const scopeByRunCaseId = new Map<string, AttachmentScope>(
		prepared.scopes.map((scope) => [scope.runCaseId, scope] as const)
	);
	const { pending, rejected } = splitRegisterPending(
		group,
		scopeByRunCaseId,
		storage,
		userId
	);
	const registered: IngestAttachmentRegistered[] = [];
	for (const batch of chunk(pending, REGISTER_CONCURRENCY)) {
		// biome-ignore lint/performance/noAwaitInLoops: 分批是为了限并发，见 REGISTER_CONCURRENCY
		const outcomes = await Promise.all(batch.map(registerOne));
		for (const outcome of outcomes) {
			if (outcome.kind === "registered") {
				registered.push(outcome.attachment);
				continue;
			}
			rejected.push(outcome.rejection);
		}
	}
	return {
		projectId: prepared.scopes[0]?.projectId ?? null,
		registered,
		rejected,
	};
}

/**
 * §5.7：**对每个被写入的任务各发一条**失效事件。`testRun` 那条映射已经把
 * 列表、详情、报告、附件四处缓存全覆盖，漏发其中一条的表现是
 * 「有人的页面永远停在旧附件列表」，而这种 bug 只有恰好开着那个页面的人才碰得到。
 */
export async function registerParsed(
	request: IngestAttachmentRegisterRequest,
	user: User
): Promise<IngestAttachmentRegisterOutcome> {
	const storage = getR2Storage();
	if (storage === null) {
		return { kind: "ok", receipt: unconfiguredRegisterReceipt(request) };
	}
	const actor = attachmentIngestActor(user);
	const registered: IngestAttachmentRegistered[] = [];
	/**
	 * §4.4：token 的权限等于其主人。登记请求里没有 projectId，作用域只能从
	 * 每个 `runId` 反查——判据与另外三条端点同源，逐组拒绝而非整请求 403 的
	 * 理由写在 `./attachment-register-scope`。
	 *
	 * 这一关排在守卫事务与 `HeadObject` **之前**：把一个越权批次放进
	 * `prepareRunAttachmentUploads` 就是让它去抢别人项目里那把 `test_runs`
	 * 行锁，而它本来一行都不该写。
	 */
	const scope = splitRegisterGroupsByAccess(
		groupRegisterItemsByRunId(request.attachments),
		await forbiddenRunIds(
			user,
			request.attachments.map((attachment) => attachment.runId)
		)
	);
	const rejected: IngestAttachmentRegisterRejection[] = [...scope.rejected];
	for (const group of scope.allowed) {
		// biome-ignore lint/performance/noAwaitInLoops: 每组一个守卫事务，串行抢行锁，同 signGroup
		const outcome = await registerGroup(group, storage, user.id);
		registered.push(...outcome.registered);
		rejected.push(...outcome.rejected);
		if (outcome.projectId === null || outcome.registered.length === 0) {
			continue;
		}
		publishInvalidateAs({
			action: "update",
			actor,
			entity: "testRun",
			ids: [group.runId],
			projectId: outcome.projectId,
		});
	}
	return {
		kind: "ok",
		receipt: { registered, rejected, storageConfigured: true },
	};
}
