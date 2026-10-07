import { and, eq, inArray } from "drizzle-orm";

import type { TestRunExecutedVia } from "../schema/test-runs";
import { testRunCases } from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";
import type { RunCaseVerdictSnapshot } from "./test-run-case-events-core";
import type { RunLocked } from "./test-run-status-core";

export type RunCaseWriteRejection = RunLocked | { kind: "not-found" };

export interface RunReviewPending {
	kind: "review-pending";
}

export interface InvalidRunCases {
	invalidRunCaseIds: string[];
	kind: "invalid-run-cases";
}

export function dedupe(ids: string[]): string[] {
	return [...new Set(ids)];
}

export async function findInvalidRunCaseIds(
	tx: DbTransaction,
	runId: string,
	runCaseIds: string[]
): Promise<string[]> {
	if (runCaseIds.length === 0) {
		return [];
	}
	const rows = await tx
		.select({ id: testRunCases.id })
		.from(testRunCases)
		.where(
			and(eq(testRunCases.runId, runId), inArray(testRunCases.id, runCaseIds))
		);
	const owned = new Set(rows.map((row) => row.id));
	return runCaseIds.filter((id) => !owned.has(id));
}

export interface RunCaseVerdictSnapshotRow extends RunCaseVerdictSnapshot {
	executedVia: TestRunExecutedVia | null;
}

export async function selectRunCaseVerdictSnapshots(
	tx: DbTransaction,
	runId: string,
	runCaseIds: string[]
): Promise<RunCaseVerdictSnapshotRow[]> {
	if (runCaseIds.length === 0) {
		return [];
	}
	return await tx
		.select({
			comment: testRunCases.comment,
			executedVia: testRunCases.executedVia,
			id: testRunCases.id,
			result: testRunCases.result,
		})
		.from(testRunCases)
		.where(
			and(eq(testRunCases.runId, runId), inArray(testRunCases.id, runCaseIds))
		);
}

export function findMissingRunCaseIds(
	runCaseIds: string[],
	snapshots: RunCaseVerdictSnapshot[]
): string[] {
	const owned = new Set(snapshots.map((snapshot) => snapshot.id));
	return runCaseIds.filter((id) => !owned.has(id));
}
