import { and, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import { testRunCases } from "../schema/test-runs";
import type { DbTransaction, RepositoryNotFound } from "./repository-types";
import type { RunLocked } from "./test-run-status-core";
import { ensureRunWritable } from "./test-run-status-repository";

export interface AttachmentScope {
	projectId: string;
	runCaseId: string;
	runId: string;
}

export type PrepareAttachmentUploadResult =
	| RunLocked
	| RepositoryNotFound
	| { kind: "ok"; scope: AttachmentScope };

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

export async function findRunIdInTx(
	tx: DbTransaction,
	runCaseId: string
): Promise<string | null> {
	const [row] = await tx
		.select({ runId: testRunCases.runId })
		.from(testRunCases)
		.where(eq(testRunCases.id, runCaseId));
	return row?.runId ?? null;
}

export interface PrepareRunAttachmentUploadsInput {
	runCaseIds: string[];
	runId: string;
}

export type PrepareRunAttachmentUploadsResult =
	| RunLocked
	| RepositoryNotFound
	| {
			kind: "ok";
			scopes: AttachmentScope[];
	  };

export function prepareRunAttachmentUploads(
	input: PrepareRunAttachmentUploadsInput
): Promise<PrepareRunAttachmentUploadsResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		if (input.runCaseIds.length === 0) {
			return { kind: "ok", scopes: [] };
		}
		const rows = await tx
			.select({ runCaseId: testRunCases.id })
			.from(testRunCases)
			.where(
				and(
					eq(testRunCases.runId, input.runId),
					inArray(testRunCases.id, input.runCaseIds)
				)
			);
		return {
			kind: "ok",
			scopes: rows.map((row) => ({
				projectId: writable.run.projectId,
				runCaseId: row.runCaseId,
				runId: input.runId,
			})),
		};
	});
}
