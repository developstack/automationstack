import { and, count, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import { testCases } from "../schema/test-cases";
import { testRunAttachments } from "../schema/test-run-attachments";
import { testRunCases } from "../schema/test-runs";
import type { DbTransaction, RepositoryNotFound } from "./repository-types";
import type { RunWriteLock } from "./test-run-status-core";
import { ensureRunWritable } from "./test-run-status-repository";
import {
	rejectStepAttachment,
	type StepAttachmentRejection,
} from "./test-run-step-attachments-core";

export interface AttachmentScope {
	projectId: string;
	runCaseId: string;
	runId: string;
}

export type PrepareAttachmentUploadResult =
	| RunWriteLock
	| RepositoryNotFound
	| StepAttachmentRejection
	| { kind: "ok"; scope: AttachmentScope };

/**
 * 检查这个步骤还能不能再加一个实际附件：步骤属于这条用例，并且没有达到上限。
 * 调用方必须先锁住测试任务（ensureRunWritable），这样并发的登记不会一起越过上限。
 */
export async function checkStepAttachmentInTx(
	tx: DbTransaction,
	runCaseId: string,
	stepId: string
): Promise<StepAttachmentRejection | null> {
	const [target] = await tx
		.select({ steps: testCases.steps })
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.where(eq(testRunCases.id, runCaseId));
	const [existing] = await tx
		.select({ value: count() })
		.from(testRunAttachments)
		.where(
			and(
				eq(testRunAttachments.runCaseId, runCaseId),
				eq(testRunAttachments.stepId, stepId)
			)
		);
	return rejectStepAttachment(
		target?.steps ?? [],
		stepId,
		existing?.value ?? 0
	);
}

/** 上传前的检查。stepId 不是 null 时，还检查这个步骤还能不能再加一个实际附件。 */
export function prepareAttachmentUpload(
	runCaseId: string,
	stepId: string | null = null
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
		const rejection =
			stepId === null
				? null
				: await checkStepAttachmentInTx(tx, runCaseId, stepId);
		if (rejection !== null) {
			return rejection;
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
	| RunWriteLock
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
