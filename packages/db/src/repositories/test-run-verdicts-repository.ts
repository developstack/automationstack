import { eq, inArray } from "drizzle-orm";

import { db } from "../index";
import {
	type TestRun,
	type TestRunCase,
	type TestRunCaseResult,
	type TestRunExecutedVia,
	testRunCases,
} from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";
import { insertRunCaseEvents } from "./test-run-case-event-writes";
import {
	dedupe,
	findMissingRunCaseIds,
	type InvalidRunCases,
	type RunCaseWriteRejection,
	type RunReviewPending,
	selectRunCaseVerdictSnapshots,
} from "./test-run-case-guards";
import {
	applyRunStatusDerivation,
	ensureRunWritable,
} from "./test-run-status-repository";
import { buildResultPatch } from "./test-run-verdict-patch";

export type {
	ApplyAutomationVerdictsInput,
	ApplyAutomationVerdictsOutcome,
	AutomationVerdictItem,
} from "./test-run-automation-verdicts";
// biome-ignore lint/performance/noBarrelFile: 兼容性 re-export，不是 barrel——自动化上报那条路径本来就定义在本文件里，拆去 test-run-automation-verdicts.ts 只为行数与函数长度上限，调用方的导入路径必须保持不变
export { applyAutomationVerdicts } from "./test-run-automation-verdicts";

export interface SetRunCaseResultInput {
	actorId: string | null;
	comment?: string | null;
	result: TestRunCaseResult;
	runCaseId: string;
	via: TestRunExecutedVia;
}

export type SetRunCaseResultOutcome =
	| RunCaseWriteRejection
	| RunReviewPending
	| { kind: "ok"; run: TestRun; runCase: TestRunCase };

async function selectRunCaseVerdictTarget(
	tx: DbTransaction,
	runCaseId: string
) {
	const [target] = await tx
		.select({
			comment: testRunCases.comment,
			result: testRunCases.result,
			runId: testRunCases.runId,
		})
		.from(testRunCases)
		.where(eq(testRunCases.id, runCaseId))
		.limit(1);
	return target ?? null;
}

export function setRunCaseResult(
	input: SetRunCaseResultInput
): Promise<SetRunCaseResultOutcome> {
	return db.transaction(async (tx) => {
		const target = await selectRunCaseVerdictTarget(tx, input.runCaseId);
		if (!target) {
			return { kind: "not-found" as const };
		}
		const writable = await ensureRunWritable(tx, target.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		if (run.status === "pending_review") {
			return { kind: "review-pending" as const };
		}
		const [runCase] = await tx
			.update(testRunCases)
			.set(buildResultPatch(input))
			.where(eq(testRunCases.id, input.runCaseId))
			.returning();
		if (!runCase) {
			throw new Error("setRunCaseResult: update returned no row");
		}
		await insertRunCaseEvents(tx, {
			actorId: input.actorId,
			comment: input.comment,
			snapshots: [
				{ comment: target.comment, id: input.runCaseId, result: target.result },
			],
			toResult: input.result,
		});
		const updated = await applyRunStatusDerivation(tx, {
			actorId: input.actorId,
			run,
		});
		return { kind: "ok" as const, run: updated, runCase };
	});
}

export interface BulkSetRunCaseResultInput {
	actorId: string | null;
	result: TestRunCaseResult;
	runCaseIds: string[];
	runId: string;
	via: TestRunExecutedVia;
}

export type BulkSetRunCaseResultOutcome =
	| InvalidRunCases
	| RunCaseWriteRejection
	| RunReviewPending
	| { kind: "ok"; run: TestRun; runCaseIds: string[] };

export function bulkSetRunCaseResult(
	input: BulkSetRunCaseResultInput
): Promise<BulkSetRunCaseResultOutcome> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		if (run.status === "pending_review") {
			return { kind: "review-pending" as const };
		}
		const runCaseIds = dedupe(input.runCaseIds);
		const snapshots = await selectRunCaseVerdictSnapshots(
			tx,
			run.id,
			runCaseIds
		);
		const invalidRunCaseIds = findMissingRunCaseIds(runCaseIds, snapshots);
		if (invalidRunCaseIds.length > 0) {
			return { invalidRunCaseIds, kind: "invalid-run-cases" as const };
		}
		if (runCaseIds.length === 0) {
			return { kind: "ok" as const, run, runCaseIds: [] };
		}
		const updatedRows = await tx
			.update(testRunCases)
			.set(buildResultPatch(input))
			.where(inArray(testRunCases.id, runCaseIds))
			.returning({ id: testRunCases.id });
		await insertRunCaseEvents(tx, {
			actorId: input.actorId,
			snapshots,
			toResult: input.result,
		});
		const updated = await applyRunStatusDerivation(tx, {
			actorId: input.actorId,
			run,
		});
		return {
			kind: "ok" as const,
			run: updated,
			runCaseIds: updatedRows.map((row) => row.id),
		};
	});
}
