import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import { testCases } from "../schema/test-cases";
import { testRunEvents } from "../schema/test-run-events";
import { type TestRun, testRunCases, testRuns } from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";
import type { RunWriteLock } from "./test-run-status-core";
import { ensureRunWritable } from "./test-run-status-repository";

export interface CreateTestRunInput {
	caseIds: string[];
	createdBy: string | null;
	description?: string | null;
	name: string;
	projectId: string;
}

export type CreateTestRunResult =
	| { invalidCaseIds: string[]; kind: "invalid-cases" }
	| { kind: "created"; run: TestRun }
	| { kind: "empty-cases" };

function dedupe(ids: string[]): string[] {
	return [...new Set(ids)];
}

async function findInvalidCaseIds(
	tx: DbTransaction,
	projectId: string,
	caseIds: string[]
): Promise<string[]> {
	if (caseIds.length === 0) {
		return [];
	}
	const rows = await tx
		.select({ id: testCases.id })
		.from(testCases)
		.where(
			and(eq(testCases.projectId, projectId), inArray(testCases.id, caseIds))
		);
	const owned = new Set(rows.map((row) => row.id));
	return caseIds.filter((id) => !owned.has(id));
}

export async function createTestRunInTx(
	tx: DbTransaction,
	input: CreateTestRunInput
): Promise<CreateTestRunResult> {
	const caseIds = dedupe(input.caseIds);
	if (caseIds.length === 0) {
		return { kind: "empty-cases" };
	}
	const invalidCaseIds = await findInvalidCaseIds(tx, input.projectId, caseIds);
	if (invalidCaseIds.length > 0) {
		return { invalidCaseIds, kind: "invalid-cases" };
	}
	const [run] = await tx
		.insert(testRuns)
		.values({
			createdBy: input.createdBy,
			description: input.description ?? null,
			name: input.name,
			projectId: input.projectId,
		})
		.returning();
	if (!run) {
		throw new Error("createTestRun: insert returned no row");
	}
	await tx.insert(testRunCases).values(
		caseIds.map((caseId, sortOrder) => ({
			caseId,
			runId: run.id,
			sortOrder,
		}))
	);
	await tx.insert(testRunEvents).values({
		actorId: input.createdBy,
		fromStatus: null,
		runId: run.id,
		toStatus: "pending_review",
	});
	return { kind: "created", run };
}

export function createTestRun(
	input: CreateTestRunInput
): Promise<CreateTestRunResult> {
	return db.transaction((tx) => createTestRunInTx(tx, input));
}

export interface UpdateTestRunInput {
	description?: string | null;
	name?: string;
	runId: string;
}

export type UpdateTestRunResult =
	| RunWriteLock
	| { kind: "not-found" }
	| { kind: "ok"; run: TestRun };

export function updateTestRun(
	input: UpdateTestRunInput
): Promise<UpdateTestRunResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const patch: Partial<typeof testRuns.$inferInsert> = {};
		if (input.name !== undefined) {
			patch.name = input.name;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (Object.keys(patch).length === 0) {
			return { kind: "ok" as const, run: writable.run };
		}
		const [updated] = await tx
			.update(testRuns)
			.set(patch)
			.where(eq(testRuns.id, input.runId))
			.returning();
		if (!updated) {
			throw new Error("updateTestRun: update returned no row");
		}
		return { kind: "ok" as const, run: updated };
	});
}

export type RemoveTestRunResult =
	| RunWriteLock
	| { kind: "not-found" }
	| { kind: "ok"; run: TestRun };

export function removeTestRun(runId: string): Promise<RemoveTestRunResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const [removed] = await tx
			.delete(testRuns)
			.where(eq(testRuns.id, runId))
			.returning();
		if (!removed) {
			throw new Error("removeTestRun: delete returned no row");
		}
		return { kind: "ok" as const, run: removed };
	});
}

export interface CreateTestRunFromFailedInput {
	createdBy: string | null;
	description?: string | null;
	name: string;
	sourceRunId: string;
}

export type CreateTestRunFromFailedResult =
	| CreateTestRunResult
	| { kind: "no-failed-cases" }
	| { kind: "source-not-found" };

export function createTestRunFromFailed(
	input: CreateTestRunFromFailedInput
): Promise<CreateTestRunFromFailedResult> {
	return db.transaction(async (tx) => {
		const [source] = await tx
			.select({ projectId: testRuns.projectId })
			.from(testRuns)
			.where(eq(testRuns.id, input.sourceRunId))
			.limit(1);
		if (!source) {
			return { kind: "source-not-found" as const };
		}
		const rows = await tx
			.select({ caseId: testRunCases.caseId })
			.from(testRunCases)
			.where(
				and(
					eq(testRunCases.runId, input.sourceRunId),
					eq(testRunCases.result, "failed")
				)
			)
			.orderBy(asc(testRunCases.sortOrder), asc(testRunCases.createdAt));
		if (rows.length === 0) {
			return { kind: "no-failed-cases" as const };
		}
		return await createTestRunInTx(tx, {
			caseIds: rows.map((row) => row.caseId),
			createdBy: input.createdBy,
			description: input.description ?? null,
			name: input.name,
			projectId: source.projectId,
		});
	});
}
