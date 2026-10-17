import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import {
	type CaseAttachment,
	caseAttachments,
} from "../schema/case-attachments";
import { testCases } from "../schema/test-cases";
import type { DbTransaction, RepositoryNotFound } from "./repository-types";

export interface CaseAttachmentScope {
	caseId: string;
	projectId: string;
}

export type PrepareCaseAttachmentUploadResult =
	| RepositoryNotFound
	| { kind: "ok"; scope: CaseAttachmentScope };

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
	contentType: string;
	createdBy: string | null;
	fileName: string;
	isStorageKeyOwned: (scope: CaseAttachmentScope) => boolean;
	sizeBytes: number;
	storageKey: string;
}

export type RegisterCaseAttachmentResult =
	| RepositoryNotFound
	| {
			attachment: CaseAttachment;
			kind: "registered";
			scope: CaseAttachmentScope;
	  }
	| { kind: "invalid-storage-key" };

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

export function listCaseAttachments(caseId: string): Promise<CaseAttachment[]> {
	return db
		.select()
		.from(caseAttachments)
		.where(eq(caseAttachments.caseId, caseId))
		.orderBy(desc(caseAttachments.createdAt));
}

export interface NewCaseAttachmentRow {
	contentType: string;
	createdBy: string | null;
	fileName: string;
	id: string;
	sizeBytes: number;
	storageKey: string;
}

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
