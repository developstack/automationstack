import { asc, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import {
	type TestRunAttachment,
	testRunAttachments,
} from "../schema/test-run-attachments";
import {
	type TestRunAttachmentKind,
	type TestRunExecutedVia,
	testRunCases,
} from "../schema/test-runs";
import type { DbTransaction, RepositoryNotFound } from "./repository-types";
import {
	type AttachmentScope,
	checkStepAttachmentInTx,
	findRunIdInTx,
} from "./test-run-attachment-scopes";
import type { RunWriteLock } from "./test-run-status-core";
import { ensureRunWritable } from "./test-run-status-repository";
import type { StepAttachmentRejection } from "./test-run-step-attachments-core";

// biome-ignore lint/performance/noBarrelFile: 兼容性 re-export，不是 barrel——presign 那几个函数本来就定义在本文件里，拆去 test-run-attachment-scopes.ts 只为行数上限，调用方的导入路径必须保持不变
export {
	type AttachmentScope,
	type PrepareAttachmentUploadResult,
	type PrepareRunAttachmentUploadsInput,
	type PrepareRunAttachmentUploadsResult,
	prepareAttachmentUpload,
	prepareRunAttachmentUploads,
} from "./test-run-attachment-scopes";

export interface RegisterAttachmentInput {
	contentType: string;
	createdBy: string | null;
	fileName: string;
	isStorageKeyOwned: (scope: AttachmentScope) => boolean;
	kind: TestRunAttachmentKind;
	runCaseId: string;
	sizeBytes: number;
	storageKey: string;
	uploadedVia?: TestRunExecutedVia;
}

interface AttachmentRegistered {
	attachment: TestRunAttachment;
	kind: "registered";
	scope: AttachmentScope;
}

type ScopeRejection =
	| RunWriteLock
	| RepositoryNotFound
	| { kind: "invalid-storage-key" };

export type RegisterAttachmentResult = ScopeRejection | AttachmentRegistered;

/** 找到用例行所属的测试任务并锁住，检查测试任务可写、storageKey 属于这个用例行。 */
async function claimScopeInTx(
	tx: DbTransaction,
	input: RegisterAttachmentInput
): Promise<ScopeRejection | { kind: "ok"; scope: AttachmentScope }> {
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
	return { kind: "ok", scope };
}

async function insertAttachmentInTx(
	tx: DbTransaction,
	input: RegisterAttachmentInput,
	target: { scope: AttachmentScope; stepId: string | null }
): Promise<AttachmentRegistered> {
	const [attachment] = await tx
		.insert(testRunAttachments)
		.values({
			contentType: input.contentType,
			createdBy: input.createdBy,
			fileName: input.fileName,
			kind: input.kind,
			runCaseId: input.runCaseId,
			sizeBytes: input.sizeBytes,
			stepId: target.stepId,
			storageKey: input.storageKey,
			uploadedVia: input.uploadedVia ?? null,
		})
		.returning();
	if (!attachment) {
		throw new Error("registerAttachment: insert returned no row");
	}
	return { attachment, kind: "registered", scope: target.scope };
}

/** 登记一个挂在整条用例上的附件。自动化上传使用这个函数，行为不变。 */
export function registerAttachment(
	input: RegisterAttachmentInput
): Promise<RegisterAttachmentResult> {
	return db.transaction(async (tx) => {
		const claimed = await claimScopeInTx(tx, input);
		if (claimed.kind !== "ok") {
			return claimed;
		}
		return insertAttachmentInTx(tx, input, {
			scope: claimed.scope,
			stepId: null,
		});
	});
}

export interface RegisterStepAttachmentInput
	extends Omit<RegisterAttachmentInput, "uploadedVia"> {
	/** 实际附件所属的步骤（见 CONTEXT.md）。必须是这条用例的步骤。 */
	stepId: string;
}

export type RegisterStepAttachmentResult =
	| RegisterAttachmentResult
	| StepAttachmentRejection;

/** 登记一个步骤的实际附件：步骤必须属于这条用例，一个步骤最多 MAX_STEP_ATTACHMENTS 个。 */
export function registerStepAttachment(
	input: RegisterStepAttachmentInput
): Promise<RegisterStepAttachmentResult> {
	return db.transaction(async (tx) => {
		const claimed = await claimScopeInTx(tx, input);
		if (claimed.kind !== "ok") {
			return claimed;
		}
		// 一个文件只能登记一次：否则删除其中一个附件时会删掉另一个附件的文件
		const [duplicate] = await tx
			.select({ id: testRunAttachments.id })
			.from(testRunAttachments)
			.where(eq(testRunAttachments.storageKey, input.storageKey))
			.limit(1);
		if (duplicate) {
			return { kind: "invalid-storage-key" };
		}
		// 测试任务已经被锁住，所以计数和插入之间不会有别的登记
		const rejection = await checkStepAttachmentInTx(
			tx,
			input.runCaseId,
			input.stepId
		);
		if (rejection !== null) {
			return rejection;
		}
		return insertAttachmentInTx(
			tx,
			{ ...input, uploadedVia: "manual" },
			{ scope: claimed.scope, stepId: input.stepId }
		);
	});
}

/** 一条用例的全部附件，按上传顺序。实际附件按 stepId 分到各个步骤，顺序不变。 */
export function listAttachments(
	runCaseId: string
): Promise<TestRunAttachment[]> {
	return listAttachmentsForRunCases([runCaseId]);
}

/** 几条用例的全部附件，用一次查询读取，按上传顺序。报告用它读取全部失败用例的附件。 */
export async function listAttachmentsForRunCases(
	runCaseIds: readonly string[]
): Promise<TestRunAttachment[]> {
	if (runCaseIds.length === 0) {
		return [];
	}
	return await db
		.select()
		.from(testRunAttachments)
		.where(inArray(testRunAttachments.runCaseId, [...runCaseIds]))
		.orderBy(asc(testRunAttachments.createdAt), asc(testRunAttachments.id));
}

export type RemoveAttachmentResult =
	| RunWriteLock
	| RepositoryNotFound
	| { kind: "read-only" }
	| {
			attachment: TestRunAttachment;
			kind: "removed";
			scope: AttachmentScope;
	  };

/** 删除一个实际附件。整条用例的附件（自动化上传和以前人工上传的）只读，不能删除。 */
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
		if (row.attachment.stepId === null) {
			return { kind: "read-only" };
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
