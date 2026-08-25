import { resolveAutomationTargets } from "@automationstack/db/repositories/automation-ingest-repository";
import { projectExists } from "@automationstack/db/repositories/projects-repository";
import {
	type AttachmentScope,
	prepareRunAttachmentUploads,
} from "@automationstack/db/repositories/test-run-attachments-repository";
import { settleAutoSubmitForProject } from "@automationstack/db/repositories/test-run-auto-submit-repository";

import {
	buildAttachmentStorageKey,
	UPLOAD_URL_TTL_SECONDS,
} from "../attachment-policy";
import { getR2Storage, type R2Storage } from "../r2";
import type {
	IngestAttachmentPresignReceipt,
	IngestAttachmentPresignRequest,
	IngestAttachmentRejection,
	IngestAttachmentUpload,
} from "./attachment-contract";
import {
	type AttachmentUploadGroup,
	type AttachmentUploadItem,
	buildGroupRejections,
	describeRunCaseVanished,
	describeRunUnwritable,
	planAttachmentUploads,
	REASON_STORAGE_UNCONFIGURED,
} from "./attachment-reconcile";

/**
 * `POST /ingest/attachments/presign` 的**编排**（plan §5.6）：查项目、结算超时
 * 自动提交、解析候选任务、折算、逐组签名。
 *
 * 本文件 import 了 db repository，**因此不可单测**（api 的 vitest project
 * 没有 `DATABASE_URL`）。所以这里刻意只剩「按顺序调用 + 传参」——
 * 会写错的判断（按 run_case 展开、配额、拒绝理由）全在 `./attachment-reconcile`
 * 及其兄弟模块，那边是纯的、有单测。HTTP 入口在 `./attachment-uploads`。
 *
 * **这个端点一个字节都不写库**（`settleAutoSubmitForProject` 是它自己的既定
 * 副作用，与结论那一侧同一次结算）。所以签完没传是安全的：库里没有任何行
 * 指向那个 key，最坏是一个孤儿对象，与两阶段上传本来就会产生的那些
 * 一起按前缀清理（见 `lib/r2.ts`）。
 */

/**
 * 端点的类型化结果。HTTP 映射由 `apps/server` 做：
 * `unauthorized` → 401、`project-not-found` → 404、`invalid-payload` → 400、
 * `ok` → 200。
 *
 * ⚠️ `ok` 里 `uploads` 为空**仍然是 200**：与 `writtenTo` 为空同理，
 * HTTP 状态码表达「请求本身有没有问题」，对账单表达「业务上发生了什么」。
 */
export type IngestAttachmentPresignOutcome =
	| { kind: "invalid-payload"; message: string }
	| { kind: "ok"; receipt: IngestAttachmentPresignReceipt }
	| { kind: "project-not-found" }
	| { kind: "unauthorized" };

/** 存储未配置时的降级对账单：一条 URL 都不发，但逐条说明原因。 */
function unconfiguredPresignReceipt(
	request: IngestAttachmentPresignRequest
): IngestAttachmentPresignReceipt {
	return {
		expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
		rejected: request.attachments.map((attachment, index) => ({
			index,
			reason: REASON_STORAGE_UNCONFIGURED,
			runName: null,
			sourceRef: attachment.sourceRef,
		})),
		storageConfigured: false,
		uploads: [],
	};
}

interface SignedGroup {
	rejected: IngestAttachmentRejection[];
	uploads: IngestAttachmentUpload[];
}

interface SignableSplit {
	rejected: IngestAttachmentRejection[];
	signable: { item: AttachmentUploadItem; scope: AttachmentScope }[];
}

/**
 * 折算时还在任务范围内、到这一刻却查不到归属的用例行，逐条拒绝。
 *
 * 差集不是理论情况：折算读的是 `resolveAutomationTargets` 的快照，而
 * `prepareRunAttachmentUploads` 是在守卫事务里重新读的；中间有人改了任务的
 * 用例范围，这一行就没了。静默跳过等于 SDK 少收一个 URL 却不知道为什么。
 */
function splitSignableItems(
	group: AttachmentUploadGroup,
	scopeByRunCaseId: Map<string, AttachmentScope>
): SignableSplit {
	const rejected: IngestAttachmentRejection[] = [];
	const signable: SignableSplit["signable"] = [];
	for (const item of group.items) {
		const scope = scopeByRunCaseId.get(item.runCaseId);
		if (scope === undefined) {
			rejected.push({
				index: item.index,
				reason: describeRunCaseVanished(group.runName),
				runName: group.runName,
				sourceRef: item.sourceRef,
			});
			continue;
		}
		signable.push({ item, scope });
	}
	return { rejected, signable };
}

/**
 * 一个测试任务一组：先过 repository 的 `submitted` 守卫拿到归属，再逐条签名。
 *
 * **守卫必须在签名之前**，理由与手工路径逐字相同：预签名 URL 一发出去就是
 * 一张我们收不回的写入凭证，只在 `register` 拦等于让已提交的测试任务照样
 * 被塞进新对象，拦下的只是「数据库里看不见」，bucket 里已经多了东西。
 * 这里不另写判据，走的就是 `ensureRunWritable`（`prepareRunAttachmentUploads`
 * 在同一个事务里 `FOR UPDATE`）。
 *
 * 签名本身是纯 CPU 的 HMAC（`getSignedUrl` 不发网络请求），所以整组并发签，
 * 不必像抢行锁那样串行。
 */
async function signGroup(
	group: AttachmentUploadGroup,
	storage: R2Storage
): Promise<SignedGroup> {
	const prepared = await prepareRunAttachmentUploads({
		runCaseIds: group.items.map((item) => item.runCaseId),
		runId: group.runId,
	});
	if (prepared.kind !== "ok") {
		// 局部失败不让整批失败（§5.8）：只有这个任务的附件进 rejected，
		// 其余任务照常签——那些附件是真的，凭什么因为无关任务的状态丢掉。
		return {
			rejected: buildGroupRejections(
				group,
				describeRunUnwritable(prepared, group.runName)
			),
			uploads: [],
		};
	}
	const scopeByRunCaseId = new Map<string, AttachmentScope>(
		prepared.scopes.map((scope) => [scope.runCaseId, scope] as const)
	);
	const { rejected, signable } = splitSignableItems(group, scopeByRunCaseId);
	const uploads = await Promise.all(
		signable.map(async ({ item, scope }) => {
			const storageKey = buildAttachmentStorageKey(scope, item);
			return {
				contentType: item.contentType,
				index: item.index,
				runCaseId: item.runCaseId,
				runId: group.runId,
				runName: group.runName,
				sourceRef: item.sourceRef,
				storageKey,
				uploadUrl: await storage.presignUpload(storageKey, item.contentType),
			};
		})
	);
	return { rejected, uploads };
}

export async function presignParsed(
	request: IngestAttachmentPresignRequest
): Promise<IngestAttachmentPresignOutcome> {
	// 只查项目存不存在，**不查成员资格**——理由见 `./execution-ingest`（§4.4）：
	// 本仓库没有项目级成员模型，token 的权限严格等于其主人。
	if (!(await projectExists(request.projectId))) {
		return { kind: "project-not-found" };
	}
	const storage = getR2Storage();
	if (storage === null) {
		return { kind: "ok", receipt: unconfiguredPresignReceipt(request) };
	}
	// D36 / §3.8：**在选候选任务之前**结算一次超时自动提交，与结论那一侧同因。
	// 少了它，一个早该自动提交的任务会被当成候选，脚本的附件就挂进了一个
	// 本该锁死的任务里——而报告事后被改是第二期明令要杜绝的事。
	await settleAutoSubmitForProject(request.projectId);
	const rows = await resolveAutomationTargets({
		projectId: request.projectId,
		// 去重后再查：一条失败带三件附件是常态，不去重等于把同一个
		// `= any($1::text[])` 参数塞进三份。
		sourceRefs: [
			...new Set(request.attachments.map((attachment) => attachment.sourceRef)),
		],
	});
	// `runIds` 白名单在**这一层**收窄，不在 SQL 里（理由见
	// `PlanAttachmentUploadsInput.runIds`）：SQL 里收窄会让被排除的候选任务
	// 在这一层彻底消失，「被白名单挡了」与「压根没有任务收它」只能糊成同一句假话。
	const planned = planAttachmentUploads({
		attachments: request.attachments,
		rows,
		runIds: request.runIds,
	});
	const rejected = [...planned.rejected];
	const uploads: IngestAttachmentUpload[] = [];
	for (const group of planned.groups) {
		// 每组一个事务、串行：`ensureRunWritable` 对 `test_runs` 行加 `FOR UPDATE`，
		// 并发发出去就是多把行锁按不确定顺序抢（§5.3）。N 现实里是 1～3。
		// biome-ignore lint/performance/noAwaitInLoops: 每组一个事务，必须串行抢行锁，见上
		const signed = await signGroup(group, storage);
		rejected.push(...signed.rejected);
		uploads.push(...signed.uploads);
	}
	return {
		kind: "ok",
		receipt: {
			expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
			rejected,
			storageConfigured: true,
			uploads,
		},
	};
}
