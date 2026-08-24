import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import {
	type TestRunAttachment,
	testRunAttachments,
} from "../schema/test-run-attachments";
import { type TestRunAttachmentKind, testRunCases } from "../schema/test-runs";
import type { DbTransaction, RepositoryNotFound } from "./repository-types";
import type { RunLocked } from "./test-run-status-core";
import { ensureRunWritable } from "./test-run-status-repository";

/**
 * 测试任务附件的元数据读写（plan §3.1 / §6）。
 *
 * 只管数据库这一半：**R2 上的对象由 `packages/api/src/lib/r2.ts` 负责**，
 * 这里连 object key 长什么样都不知道（key 规则的所有权在 api 层，见
 * `registerAttachment` 的 `isStorageKeyOwned`）。
 *
 * 所有写路径都要先过 `submitted` 守卫：已提交的测试任务是终态，
 * 传附件、删附件一律拒绝（plan §2.5 / D15）。
 */

/** 附件挂靠的那条用例行，以及它所在的测试任务与项目——api 层拼 object key 要用。 */
export interface AttachmentScope {
	projectId: string;
	runCaseId: string;
	runId: string;
}

export type PrepareAttachmentUploadResult =
	| RunLocked
	| RepositoryNotFound
	| { kind: "ok"; scope: AttachmentScope };

/**
 * 查出用例行的归属并确认测试任务可写——**presign 之前**必须走这一遭。
 *
 * 为什么 presign 也要过 `submitted` 守卫：签名一发出去就是一张我们收不回的
 * 写入凭证，只在 `register` 拦等于让已提交的测试任务照样能被塞进新对象，
 * 拦下的只是「数据库里看不见」，bucket 里已经多了东西。
 *
 * `ensureRunWritable` 内部含 `SELECT ... FOR UPDATE`，所以查归属与判状态
 * 必须在**同一个事务**里：分两次查就是 TOCTOU——查完到用的这段时间里，
 * 别人完全可以把测试任务提交掉。
 */
export function prepareAttachmentUpload(
	runCaseId: string
): Promise<PrepareAttachmentUploadResult> {
	return db.transaction(async (tx) => {
		const runId = await findRunIdInTx(tx, runCaseId);
		if (runId === null) {
			return { kind: "not-found" };
		}
		const writable = await ensureRunWritable(tx, runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		return {
			kind: "ok",
			scope: { projectId: writable.run.projectId, runCaseId, runId },
		};
	});
}

/**
 * 用例行所属的测试任务 id。
 *
 * 这里只取 runId 而不顺手 join `test_runs` 拿 projectId：紧接着的
 * `ensureRunWritable` 会把那一行 `FOR UPDATE` 锁住并整行读出来，
 * projectId 从它的返回值上取即可，多 join 一次只是把同一行读两遍，
 * 还会让「哪一次读到的才算数」变成一个要想的问题。
 */
async function findRunIdInTx(
	tx: DbTransaction,
	runCaseId: string
): Promise<string | null> {
	const [row] = await tx
		.select({ runId: testRunCases.runId })
		.from(testRunCases)
		.where(eq(testRunCases.id, runCaseId));
	return row?.runId ?? null;
}

export interface RegisterAttachmentInput {
	/**
	 * **`HeadObject` 读回的真实值**，不是前端声明的值。
	 * 调用方负责保证这一点（见 routers/test-run-attachments.ts 的 `register`）。
	 */
	contentType: string;
	createdBy: string | null;
	/** 原始文件名，纯展示标签。不参与 key、不参与任何路径拼接（见 schema 注释）。 */
	fileName: string;
	/**
	 * 判定 `storageKey` 是否确实属于这条用例行。
	 *
	 * key 的命名规则归 api 层所有（db 不该知道 R2 的目录结构），但这个判断
	 * **必须在插入所在的同一个事务里**做：router 先查一次归属再调 repository
	 * 就又是 TOCTOU。所以把判据本身作为一个纯函数传进来。
	 */
	isStorageKeyOwned: (scope: AttachmentScope) => boolean;
	kind: TestRunAttachmentKind;
	runCaseId: string;
	/** 同 `contentType`：`HeadObject` 读回的真实字节数。 */
	sizeBytes: number;
	storageKey: string;
}

export type RegisterAttachmentResult =
	| RunLocked
	| RepositoryNotFound
	| {
			attachment: TestRunAttachment;
			kind: "registered";
			/** 回带给调用方发实时失效事件——事件要的是 runId / projectId，不是 runCaseId。 */
			scope: AttachmentScope;
	  }
	| { kind: "invalid-storage-key" };

/**
 * 前端直传完成后登记元数据。
 *
 * 再查一次 `submitted` 守卫而不是信任 presign 时的结论：presign 与 register
 * 之间隔着一次完整的文件上传，几十秒到几分钟，这中间测试任务完全可能被提交。
 *
 * `isStorageKeyOwned` 拦的是伪造的 key：客户端回传的 storageKey 是纯输入，
 * 不验就等于任何人都能把别人的截图登记到自己的用例行上，或者登记一个
 * 根本不存在的 key，让报告页出现一张永远加载不出来的死图。
 */
export function registerAttachment(
	input: RegisterAttachmentInput
): Promise<RegisterAttachmentResult> {
	return db.transaction(async (tx) => {
		const runId = await findRunIdInTx(tx, input.runCaseId);
		if (runId === null) {
			return { kind: "not-found" };
		}
		const writable = await ensureRunWritable(tx, runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const scope: AttachmentScope = {
			projectId: writable.run.projectId,
			runCaseId: input.runCaseId,
			runId,
		};
		if (!input.isStorageKeyOwned(scope)) {
			return { kind: "invalid-storage-key" };
		}
		const [attachment] = await tx
			.insert(testRunAttachments)
			.values({
				contentType: input.contentType,
				createdBy: input.createdBy,
				fileName: input.fileName,
				kind: input.kind,
				runCaseId: input.runCaseId,
				sizeBytes: input.sizeBytes,
				storageKey: input.storageKey,
			})
			.returning();
		if (!attachment) {
			throw new Error("registerAttachment: insert returned no row");
		}
		return { attachment, kind: "registered", scope };
	});
}

/**
 * 某条用例行的附件列表，最近上传的在前。
 *
 * **不过 `submitted` 守卫**：已提交的测试任务是只读，不是不可读——报告页要展示
 * 三个月前那次失败的截图，读路径一旦被锁死，锁死本身就毁了报告的价值。
 */
export function listAttachments(
	runCaseId: string
): Promise<TestRunAttachment[]> {
	return db
		.select()
		.from(testRunAttachments)
		.where(eq(testRunAttachments.runCaseId, runCaseId))
		.orderBy(desc(testRunAttachments.createdAt));
}

export type RemoveAttachmentResult =
	| RunLocked
	| RepositoryNotFound
	| {
			attachment: TestRunAttachment;
			kind: "removed";
			/** 同 `RegisterAttachmentResult`：调用方据此发实时失效事件。 */
			scope: AttachmentScope;
	  };

/**
 * 删除附件元数据，并把被删的行回带给调用方去删 R2 上的对象。
 *
 * **顺序是「先删库、后删对象」，不能反过来**：先删对象、库里的事务再失败，
 * 报告页上就留下一条指向不存在对象的记录——用户看到一张永远转圈的图，
 * 而且没有任何入口能把它清掉。反过来最坏只是多一个孤儿对象，
 * 与两阶段上传本来就会产生的那些一起按前缀清理即可（见 lib/r2.ts）。
 *
 * `storage_key` 通过返回值交出去，所以即使随后的对象删除失败，
 * 调用方日志里仍然留着这个 key，人工清理有据可依。
 */
export function removeAttachment(
	attachmentId: string
): Promise<RemoveAttachmentResult> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({
				attachment: testRunAttachments,
				runId: testRunCases.runId,
			})
			.from(testRunAttachments)
			.innerJoin(
				testRunCases,
				eq(testRunCases.id, testRunAttachments.runCaseId)
			)
			.where(eq(testRunAttachments.id, attachmentId));
		if (!row) {
			return { kind: "not-found" };
		}
		const writable = await ensureRunWritable(tx, row.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		await tx
			.delete(testRunAttachments)
			.where(eq(testRunAttachments.id, attachmentId));
		return {
			attachment: row.attachment,
			kind: "removed",
			scope: {
				projectId: writable.run.projectId,
				runCaseId: row.attachment.runCaseId,
				runId: row.runId,
			},
		};
	});
}
