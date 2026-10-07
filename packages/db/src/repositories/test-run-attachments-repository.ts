import { desc, eq } from "drizzle-orm";

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
import type { RepositoryNotFound } from "./repository-types";
import {
	type AttachmentScope,
	findRunIdInTx,
} from "./test-run-attachment-scopes";
import type { RunLocked } from "./test-run-status-core";
import { ensureRunWritable } from "./test-run-status-repository";

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

export type RegisterAttachmentResult =
	| RunLocked
	| RepositoryNotFound
	| {
			attachment: TestRunAttachment;
			kind: "registered";
			scope: AttachmentScope;
	  }
	| { kind: "invalid-storage-key" };

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
				uploadedVia: input.uploadedVia ?? null,
			})
			.returning();
		if (!attachment) {
			throw new Error("registerAttachment: insert returned no row");
		}
		return { attachment, kind: "registered", scope };
	});
}

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
			scope: AttachmentScope;
	  };

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
