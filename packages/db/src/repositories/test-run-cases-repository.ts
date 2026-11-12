import { and, eq, inArray, max } from "drizzle-orm";
import { db } from "../index";
import { testCases } from "../schema/test-cases";
import { type TestRun, testRunCases } from "../schema/test-runs";
import { users } from "../schema/users";
import type { DbTransaction } from "./repository-types";
import { caseModuleIdsInTx } from "./run-case-module";
import {
	dedupe,
	findInvalidRunCaseIds,
	type InvalidRunCases,
	type RunCaseWriteRejection,
} from "./test-run-case-guards";
import {
	applyRunStatusDerivation,
	ensureRunWritable,
} from "./test-run-status-repository";

export interface AddCasesToRunInput {
	actorId: string | null;
	caseIds: string[];
	runId: string;
}

export type AddCasesToRunResult =
	| RunCaseWriteRejection
	| { invalidCaseIds: string[]; kind: "invalid-cases" }
	| {
			addedRunCaseIds: string[];
			kind: "ok";
			run: TestRun;
			skippedCaseIds: string[];
	  };

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

async function nextSortOrder(
	tx: DbTransaction,
	runId: string
): Promise<number> {
	const [row] = await tx
		.select({ value: max(testRunCases.sortOrder) })
		.from(testRunCases)
		.where(eq(testRunCases.runId, runId));
	return (row?.value ?? -1) + 1;
}

export function addCasesToRun(
	input: AddCasesToRunInput
): Promise<AddCasesToRunResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		const caseIds = dedupe(input.caseIds);
		const invalidCaseIds = await findInvalidCaseIds(tx, run.projectId, caseIds);
		if (invalidCaseIds.length > 0) {
			return { invalidCaseIds, kind: "invalid-cases" as const };
		}
		if (caseIds.length === 0) {
			return {
				addedRunCaseIds: [],
				kind: "ok" as const,
				run,
				skippedCaseIds: [],
			};
		}
		const base = await nextSortOrder(tx, run.id);
		const moduleIds = await caseModuleIdsInTx(tx, caseIds);
		const inserted = await tx
			.insert(testRunCases)
			.values(
				caseIds.map((caseId, offset) => ({
					caseId,
					moduleId: moduleIds.get(caseId),
					runId: run.id,
					sortOrder: base + offset,
				}))
			)
			.onConflictDoNothing()
			.returning({ caseId: testRunCases.caseId, id: testRunCases.id });
		const insertedCaseIds = new Set(inserted.map((row) => row.caseId));
		const updated = await applyRunStatusDerivation(tx, {
			actorId: input.actorId,
			run,
		});
		return {
			addedRunCaseIds: inserted.map((row) => row.id),
			kind: "ok" as const,
			run: updated,
			skippedCaseIds: caseIds.filter((id) => !insertedCaseIds.has(id)),
		};
	});
}

export interface RemoveRunCasesInput {
	actorId: string | null;
	runCaseIds: string[];
	runId: string;
}

export type RemoveRunCasesResult =
	| RunCaseWriteRejection
	| { kind: "ok"; removedRunCaseIds: string[]; run: TestRun };

export function removeRunCases(
	input: RemoveRunCasesInput
): Promise<RemoveRunCasesResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		const runCaseIds = dedupe(input.runCaseIds);
		if (runCaseIds.length === 0) {
			return { kind: "ok" as const, removedRunCaseIds: [], run };
		}
		const removed = await tx
			.delete(testRunCases)
			.where(
				and(
					eq(testRunCases.runId, run.id),
					inArray(testRunCases.id, runCaseIds)
				)
			)
			.returning({ id: testRunCases.id });
		const updated = await applyRunStatusDerivation(tx, {
			actorId: input.actorId,
			run,
		});
		return {
			kind: "ok" as const,
			removedRunCaseIds: removed.map((row) => row.id),
			run: updated,
		};
	});
}

export interface AssignRunCasesInput {
	assigneeId: string | null;
	runCaseIds: string[];
	runId: string;
}

export type AssignRunCasesResult =
	| InvalidRunCases
	| RunCaseWriteRejection
	| { kind: "invalid-assignee" }
	| { kind: "ok"; run: TestRun; runCaseIds: string[] };

export function assignRunCases(
	input: AssignRunCasesInput
): Promise<AssignRunCasesResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const runCaseIds = dedupe(input.runCaseIds);
		const invalidRunCaseIds = await findInvalidRunCaseIds(
			tx,
			writable.run.id,
			runCaseIds
		);
		if (invalidRunCaseIds.length > 0) {
			return { invalidRunCaseIds, kind: "invalid-run-cases" as const };
		}
		if (input.assigneeId !== null) {
			const [assignee] = await tx
				.select({ id: users.id })
				.from(users)
				.where(eq(users.id, input.assigneeId))
				.limit(1);
			if (!assignee) {
				return { kind: "invalid-assignee" as const };
			}
		}
		if (runCaseIds.length === 0) {
			return { kind: "ok" as const, run: writable.run, runCaseIds: [] };
		}
		const updated = await tx
			.update(testRunCases)
			.set({ assigneeId: input.assigneeId })
			.where(inArray(testRunCases.id, runCaseIds))
			.returning({ id: testRunCases.id });
		return {
			kind: "ok" as const,
			run: writable.run,
			runCaseIds: updated.map((row) => row.id),
		};
	});
}
