import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import {
	type CaseAttachment,
	caseAttachments,
} from "../schema/case-attachments";
import { testCases } from "../schema/test-cases";
import type { DbTransaction, RepositoryNotFound } from "./repository-types";

/**
 * 用例正文贴图的元数据读写。
 *
 * 只管数据库这一半：**R2 上的对象由 `packages/api/src/lib/r2.ts` 负责**，
 * 这里连 object key 长什么样都不知道（key 规则的所有权在 api 层，见
 * `registerCaseAttachment` 的 `isStorageKeyOwned`）。
 *
 * 与 `test-run-attachments-repository.ts` 的关键差别：**这里没有任何写守卫**。
 * 那边每条写路径都要过测试任务的 `submitted` 锁死判定，用例没有等价状态——
 * 用例内容的并发保护是 `current_version` 乐观锁，而它作用在**保存正文**那一步，
 * 不作用在贴图上：图先传、正文后保存，保存时才由乐观锁裁决谁赢。
 * 贴了图但正文没保存成功，最坏是多一个没人引用的附件行（代价见 schema 注释）。
 *
 * **也刻意没有 remove**：删附件行会让引用它的**历史版本快照**变成碎图，
 * 而快照是全量冻结的，正文改了历史也改不了。理由完整写在
 * `schema/case-attachments.ts` 的文件头，别在这里加一个「顺手补上」的删除函数。
 */

/** 贴图挂靠的用例，以及它所在的项目——api 层拼 object key 要用。 */
export interface CaseAttachmentScope {
	caseId: string;
	projectId: string;
}

export type PrepareCaseAttachmentUploadResult =
	| RepositoryNotFound
	| { kind: "ok"; scope: CaseAttachmentScope };

/**
 * 用例所属项目 id。key 里的 `projectId` 必须这样反查得到，**绝不能由前端传**：
 * 前端传什么就用什么，等于让任何人把图写进任意项目的前缀下。
 */
async function findProjectIdInTx(
	tx: DbTransaction,
	caseId: string
): Promise<string | null> {
	const [row] = await tx
		.select({ projectId: testCases.projectId })
		.from(testCases)
		.where(eq(testCases.id, caseId))
		.limit(1);
	return row?.projectId ?? null;
}

/**
 * 查出用例归属——**presign 之前**走这一遭，拿到拼 key 需要的 projectId。
 *
 * 用例不存在就不签名：签出去的 URL 是一张我们收不回的写入凭证，
 * 为一条不存在的用例签名等于凭空造出一个永远不会有数据库行指向的对象。
 *
 * 单条 SELECT，不开事务：这里没有「查完到用之间状态会变」的守卫要保护，
 * 用例的 projectId 是建表即定、此后不变的（移动用例只能在同项目内换模块，
 * 见 `test-cases-repository.ts` 的 `moveTestCaseInTx`）。
 */
export async function prepareCaseAttachmentUpload(
	caseId: string
): Promise<PrepareCaseAttachmentUploadResult> {
	const [row] = await db
		.select({ projectId: testCases.projectId })
		.from(testCases)
		.where(eq(testCases.id, caseId))
		.limit(1);
	if (!row) {
		return { kind: "not-found" };
	}
	return { kind: "ok", scope: { caseId, projectId: row.projectId } };
}

export interface RegisterCaseAttachmentInput {
	caseId: string;
	/**
	 * **`HeadObject` 读回的真实值**，不是前端声明的值。
	 * 调用方负责保证这一点（见 routers/case-attachments.ts 的 `register`）。
	 */
	contentType: string;
	createdBy: string | null;
	/** 原始文件名，纯展示标签。不参与 key、不参与任何路径拼接（见 schema 注释）。 */
	fileName: string;
	/**
	 * 判定 `storageKey` 是否确实属于这条用例。
	 *
	 * key 的命名规则归 api 层所有（db 不该知道 R2 的目录结构），但这个判断
	 * **必须在插入所在的同一个事务里**做：router 先查一次归属再调 repository
	 * 就是 TOCTOU。所以把判据本身作为一个纯函数传进来。
	 */
	isStorageKeyOwned: (scope: CaseAttachmentScope) => boolean;
	/** 同 `contentType`：`HeadObject` 读回的真实字节数。 */
	sizeBytes: number;
	storageKey: string;
}

export type RegisterCaseAttachmentResult =
	| RepositoryNotFound
	| {
			attachment: CaseAttachment;
			kind: "registered";
			/** 回带给调用方发实时失效事件——事件要的是 projectId，不是 caseId。 */
			scope: CaseAttachmentScope;
	  }
	| { kind: "invalid-storage-key" };

/**
 * 前端直传完成后登记元数据。
 *
 * `isStorageKeyOwned` 拦的是伪造的 key：客户端回传的 storageKey 是纯输入，
 * 不验就等于任何人都能把别人的图登记到自己的用例上，或者登记一个根本不存在的
 * key，让正文里出现一张永远加载不出来的死图。
 *
 * 开事务是为了让「读 projectId → 验归属 → 插入」原子发生：用例在这中间被删掉时，
 * 外键会让插入直接失败，而不是留下一条指向幽灵用例的行。
 */
export function registerCaseAttachment(
	input: RegisterCaseAttachmentInput
): Promise<RegisterCaseAttachmentResult> {
	return db.transaction(async (tx) => {
		const projectId = await findProjectIdInTx(tx, input.caseId);
		if (projectId === null) {
			return { kind: "not-found" };
		}
		const scope: CaseAttachmentScope = { caseId: input.caseId, projectId };
		if (!input.isStorageKeyOwned(scope)) {
			return { kind: "invalid-storage-key" };
		}
		const [attachment] = await tx
			.insert(caseAttachments)
			.values({
				caseId: input.caseId,
				contentType: input.contentType,
				createdBy: input.createdBy,
				fileName: input.fileName,
				sizeBytes: input.sizeBytes,
				storageKey: input.storageKey,
			})
			.returning();
		if (!attachment) {
			throw new Error("registerCaseAttachment: insert returned no row");
		}
		return { attachment, kind: "registered", scope };
	});
}

/**
 * 某条用例的**全部**贴图，最近上传的在前。
 *
 * 刻意不分页、不按「正文当前是否引用」过滤：调用方拿它当 id → URL 的**查找表**，
 * 渲染正文时按 id 查（一条用例十张图发十次请求是这条链路最容易犯的错）。
 * 历史版本的正文引用的可能是当前正文里已经没有的 id，过滤掉就等于让版本回看碎图。
 *
 * 排序对查找表本身没有意义，`desc(createdAt)` 只是与
 * `test-run-attachments-repository.ts` 的 `listAttachments` 保持一致，
 * 免得将来做「附件管理」列表时两处顺序莫名不同。
 */
export function listCaseAttachments(caseId: string): Promise<CaseAttachment[]> {
	return db
		.select()
		.from(caseAttachments)
		.where(eq(caseAttachments.caseId, caseId))
		.orderBy(desc(caseAttachments.createdAt));
}

/**
 * 建用例时**与用例行同事务落库**的贴图行（新建用例时贴的图）。
 *
 * 与 `RegisterCaseAttachmentInput` 只差一个字段，但那个字段是整条链路的关键：
 * **`id` 由调用方给定**，不走 `defaultRandom()`。
 *
 * 原因在正文：新建用例时图是先传的，`![](attachment:<id>)` 必须在上传成功的
 * 那一刻就插进编辑器（否则用户看不到自己刚贴的图）。等到点保存才生成 id，
 * 就得回头去正文里做一次文本替换——那是一段会在「用户同时手改了正文」时
 * 悄悄改错东西的代码。所以 id 在 presign 阶段定下，这里只是沿用它。
 */
export interface NewCaseAttachmentRow {
	/** 同 `register`：`HeadObject` 读回的真实值，不是前端声明的值。 */
	contentType: string;
	createdBy: string | null;
	/** 原始文件名，纯展示标签。不参与 key、不参与任何路径拼接（见 schema 注释）。 */
	fileName: string;
	/** presign 阶段就定下的主键，见上面的文件注释。 */
	id: string;
	/** 同 `contentType`：`HeadObject` 读回的真实字节数。 */
	sizeBytes: number;
	storageKey: string;
}

/**
 * 把一批**已验证**的贴图行插进调用方的事务。
 *
 * 必须收 `tx` 而不是自己开事务：`case_id` 是外键，用例行还没提交时另开一条
 * 连接插附件会直接违约。归属校验（key 是否落在这条用例的前缀下）与
 * `HeadObject` 都已经在 api 层做完了——**网络请求绝不能进事务**，
 * 所以这里收到的每一行都当作事实直接写入。
 *
 * `onConflictDoNothing`（按主键）不是顺手加的防御，是这条链路的**必要行为**：
 * 保存失败（模块被并发删掉、网络断了）之后前端会拿同一份 localStorage 草稿重试，
 * 重试带的还是同一批附件 id。让第二次插入因为主键重复而炸掉，等于用户永远
 * 救不回自己的草稿。冲突时保留已有行是安全的：两次带的是同一份草稿产生的
 * 同一个 id 与同一个 storageKey，内容本就一致。
 */
export async function insertCaseAttachmentsInTx(
	tx: DbTransaction,
	caseId: string,
	rows: NewCaseAttachmentRow[]
): Promise<void> {
	if (rows.length === 0) {
		return;
	}
	await tx
		.insert(caseAttachments)
		.values(rows.map((row) => ({ ...row, caseId })))
		.onConflictDoNothing({ target: caseAttachments.id });
}
