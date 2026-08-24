import type { NewCaseAttachmentRow } from "@automationstack/db/repositories/case-attachments-repository";
import { ORPCError } from "@orpc/server";

import type { AttachmentObjectStore } from "./attachment-ingest";
import {
	type CaseAttachmentErrorThrowers,
	verifyUploadedCaseImage,
} from "./case-attachment-ingest";
import {
	type CaseAttachmentKeyScope,
	isCaseAttachmentKeyOwnedBy,
} from "./case-attachment-policy";

/**
 * **草稿态**贴图在「保存新用例」那一刻的入库前校验。
 *
 * ## 草稿态是什么
 *
 * 新建用例时**数据库里没有那条用例行**：前端打开抽屉时先 `crypto.randomUUID()`
 * 预生成 caseId，图按这个 id 直传进 R2，用户点保存时才用同一个 id 建用例。
 * 这样做的代价是「建到一半跑掉」会留下孤儿对象（与既有的两阶段直传同一种代价，
 * 见 `./r2.ts` 的文件头）；换来的是数据库零污染——不存草稿行，版本历史干净地
 * 从 v1 开始，也不需要一个清理未保存草稿的定时任务。
 *
 * 它之所以成立，全靠 object key 规则 `test-cases/{projectId}/{caseId}/{uuid}.{ext}`
 * **本身就编码了归属**：判断一个 key 属不属于这条用例，只需要看前缀，
 * 不需要数据库里存在那一行。这也意味着 `isCaseAttachmentKeyOwnedBy`
 * 是这条链路上**唯一**的归属判据，下面每一处都不能绕过它。
 *
 * ## 与 `./case-attachment-ingest.ts` 的分工
 *
 * 单条对象的「归属 → HeadObject → 白名单/上限 → 违规先删后抛」仍然完全由
 * `verifyUploadedCaseImage` 负责，这里一行都不重写：那段代码携带的顺序性质
 * 有自己的编排测试，复制一份等于把那个性质复制成两份、以后只会改一份。
 * 这个文件只加两件批量场景才有的事：**整批要么全过要么一个对象都不碰**，
 * 以及**批内不许有重复 id / 重复 key**。
 *
 * 这个文件刻意不 import `./r2.ts`：它只认 `AttachmentObjectStore` 那两个方法，
 * 因此不拖进 AWS SDK 与环境变量校验，可以直接单测。
 */

/** 前端在保存时回传的一条草稿贴图：id 与 key 都是 presign 阶段就定下的。 */
export interface DraftCaseAttachmentEntry {
	fileName: string;
	id: string;
	storageKey: string;
}

export interface VerifyDraftCaseAttachmentsTarget {
	/** 落进 `case_attachments.created_by` 的用户 id。 */
	createdBy: string | null;
	entries: DraftCaseAttachmentEntry[];
	scope: CaseAttachmentKeyScope;
	storage: AttachmentObjectStore;
}

/**
 * 本条链路只会抛 `BAD_REQUEST`：草稿态没有「用例不存在」这种情况——
 * 用例本来就还不存在，这正是草稿态的定义。
 */
export type DraftCaseAttachmentErrors = Pick<
	CaseAttachmentErrorThrowers,
	"BAD_REQUEST"
>;

/**
 * 批内重复检查。
 *
 * 落库用的是 `onConflictDoNothing`（理由见
 * `case-attachments-repository.ts` 的 `insertCaseAttachmentsInTx`），
 * 它会**静默**吞掉重复的 id。于是一批里出现两个相同 id 时，最终留在库里的行
 * 到底是哪一条取决于插入顺序，而正文里的 `![](attachment:<id>)` 会指向一张
 * 内容对不上的图。重复 storageKey 同理：两行不同 id 指向同一个对象，
 * 谁都说不清将来按 key 做清理时该保留哪一行。
 *
 * 正常前端产生不出重复（每次 presign 都新签一个 id 和一个带随机段的 key），
 * 所以这里直接拒绝，而不是去猜用户想要哪一条。
 */
function assertNoDuplicates(
	entries: DraftCaseAttachmentEntry[],
	errors: DraftCaseAttachmentErrors
): void {
	const ids = new Set(entries.map((entry) => entry.id));
	const keys = new Set(entries.map((entry) => entry.storageKey));
	if (ids.size !== entries.length || keys.size !== entries.length) {
		throw errors.BAD_REQUEST({
			message: "附件列表里存在重复的 id 或 storageKey",
		});
	}
}

/**
 * `verifyUploadedCaseImage` 的签名要求两个错误构造器，但它**一条 `NOT_FOUND`
 * 都不抛**（对象不存在走的是 `BAD_REQUEST`）。这里就地补一个别名，
 * 而不是去给 `cases.create` 的 `.errors({...})` 加一个永远不会出现的错误码——
 * 那会让前端以为建用例这条路径可能返回 404，并为它写一段死代码。
 */
function toIngestErrors(
	errors: DraftCaseAttachmentErrors
): CaseAttachmentErrorThrowers {
	return { BAD_REQUEST: errors.BAD_REQUEST, NOT_FOUND: errors.BAD_REQUEST };
}

/**
 * 校验整批草稿贴图，返回可以直接落库的行。
 *
 * 顺序是有理由的，不是随手排的：
 * 1. **先查重**——纯内存判断，不值得为一个必定要拒绝的请求发任何网络请求；
 * 2. **归属校验整批先过一遍**，一个不合法就整批拒绝，且**此时一次对象存储都还没碰**。
 *    单条的 `verifyUploadedCaseImage` 自己也会再验一次（那是它的安全性质，
 *    不该被外面这一层取代），这里这一遍换来的是更强的保证：一批里混进一个
 *    别人的 key 时，攻击者连「我的那些 key 存不存在」都探测不到；
 * 3. 最后才并发做 `HeadObject`。**并发是必须的**：上限 50 个对象串行 Head
 *    会把保存按钮卡上好几秒。此刻还没有任何事务开着——这是硬约束，
 *    网络请求绝不能进事务，所以并发在这里既安全又必要。
 */
export async function verifyDraftCaseAttachments(
	target: VerifyDraftCaseAttachmentsTarget,
	errors: DraftCaseAttachmentErrors
): Promise<NewCaseAttachmentRow[]> {
	if (target.entries.length === 0) {
		return [];
	}
	assertNoDuplicates(target.entries, errors);
	for (const entry of target.entries) {
		if (!isCaseAttachmentKeyOwnedBy(entry.storageKey, target.scope)) {
			throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例" });
		}
	}
	const ingestErrors = toIngestErrors(errors);
	return await Promise.all(
		target.entries.map(async (entry) => {
			const verified = await verifyUploadedCaseImage(
				{
					scope: target.scope,
					storage: target.storage,
					storageKey: entry.storageKey,
				},
				ingestErrors
			);
			return {
				contentType: verified.contentType,
				createdBy: target.createdBy,
				fileName: entry.fileName,
				id: entry.id,
				sizeBytes: verified.sizeBytes,
				storageKey: entry.storageKey,
			};
		})
	);
}

export interface ResolveNewCaseAttachmentsInput {
	attachments?: DraftCaseAttachmentEntry[];
	createdBy: string | null;
	/** 客户端预生成的 caseId，`cases.create` 的可选入参。 */
	id?: string;
	projectId: string;
	/** `getR2Storage()` 的结果，未配置时为 null。 */
	storage: AttachmentObjectStore | null;
}

/**
 * `cases.create` 的入口：把「可选的 attachments + 可选的 id」这对入参
 * 折算成一批已验证的落库行。
 *
 * 没传 attachments（AI 采纳 / 导入 / 脑图，以及不贴图的普通新建）时返回空数组，
 * 一次网络请求都不发、一个错误分支都走不到。
 *
 * **传了 attachments 却没传 id 是非法组合**：没有 caseId 就拼不出 key 前缀，
 * 也就无从判断这些 key 属于谁——这时任何 storageKey 都会被接受，
 * 等于把归属校验整个废掉。所以这里必须硬拒，不能默默当作「没有附件」。
 */
export function resolveNewCaseAttachments(
	input: ResolveNewCaseAttachmentsInput,
	errors: DraftCaseAttachmentErrors
): Promise<NewCaseAttachmentRow[]> {
	const entries = input.attachments ?? [];
	if (entries.length === 0) {
		return Promise.resolve([]);
	}
	if (input.id === undefined) {
		throw errors.BAD_REQUEST({
			message: "带附件创建用例时必须提供预生成的 id",
		});
	}
	if (input.storage === null) {
		// 与 `case-attachments.ts` / `case-attachment-drafts.ts` 同一句文案：
		// 用户看到的应该是同一件事，不该因为触发点不同而换个说法。
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "附件存储（R2）未配置，无法粘贴图片",
		});
	}
	return verifyDraftCaseAttachments(
		{
			createdBy: input.createdBy,
			entries,
			scope: { caseId: input.id, projectId: input.projectId },
			storage: input.storage,
		},
		errors
	);
}
