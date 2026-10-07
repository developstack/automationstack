import { sql } from "drizzle-orm";

import { db } from "../index";
import { testCases } from "../schema/test-cases";
import { type TestRun, testRunCases } from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";
import {
	type AutomationVerdictItem,
	assertAutomationVerdictItems,
	buildAutomationEventRows,
	partitionAutomationTargets,
} from "./test-run-automation-verdict-core";
import { insertRunCaseEventRows } from "./test-run-case-event-writes";
import {
	dedupe,
	findMissingRunCaseIds,
	type InvalidRunCases,
	type RunCaseVerdictSnapshotRow,
	type RunCaseWriteRejection,
	type RunReviewPending,
	selectRunCaseVerdictSnapshots,
} from "./test-run-case-guards";
import {
	applyRunStatusDerivation,
	ensureRunWritable,
} from "./test-run-status-repository";
import { uniformStepResultsSql } from "./test-run-step-results-sql";

export type { AutomationVerdictItem } from "./test-run-automation-verdict-core";

export interface ApplyAutomationVerdictsInput {
	actorId: string | null;
	executionId: string;
	items: AutomationVerdictItem[];
	overwriteManual: boolean;
	runId: string;
}

export type ApplyAutomationVerdictsOutcome =
	| InvalidRunCases
	| RunCaseWriteRejection
	| RunReviewPending
	| {
			kind: "ok";
			run: TestRun;
			skippedRunCaseIds: string[];
			updatedRunCaseIds: string[];
	  };

type AutomationSnapshotLookup =
	| InvalidRunCases
	| { kind: "ok"; snapshotById: Map<string, RunCaseVerdictSnapshotRow> };

async function loadAutomationSnapshots(
	tx: DbTransaction,
	runId: string,
	runCaseIds: string[]
): Promise<AutomationSnapshotLookup> {
	const snapshots = await selectRunCaseVerdictSnapshots(tx, runId, runCaseIds);
	const invalidRunCaseIds = findMissingRunCaseIds(runCaseIds, snapshots);
	if (invalidRunCaseIds.length > 0) {
		return { invalidRunCaseIds, kind: "invalid-run-cases" as const };
	}
	return {
		kind: "ok",
		snapshotById: new Map(
			snapshots.map((snapshot) => [snapshot.id, snapshot] as const)
		),
	};
}

async function updateAutomationVerdictRows(
	tx: DbTransaction,
	input: ApplyAutomationVerdictsInput,
	targets: AutomationVerdictItem[]
): Promise<string[]> {
	const valueRows = targets.map(
		(item) =>
			sql`(${item.runCaseId}::uuid, ${item.result}::test_run_case_result, ${item.comment}::text)`
	);
	const updatedRows = await tx.execute<{ id: string }>(sql`
		update ${testRunCases}
		set result = v.result,
			comment = v.comment,
			case_version = (select ${testCases.currentVersion} from ${testCases} where ${testCases.id} = ${testRunCases.caseId}),
			executed_at = now(),
			executed_by = ${input.actorId}::uuid,
			executed_via = 'automation',
			last_automation_execution_id = ${input.executionId}::uuid,
			step_results = ${uniformStepResultsSql({ lastStepComment: sql`v.comment`, result: sql`v.result::text` })}
		from (values ${sql.join(valueRows, sql`, `)}) as v(id, result, comment)
		where ${testRunCases.id} = v.id
		returning ${testRunCases.id}
	`);
	return updatedRows.rows.map((row) => String(row.id));
}

interface AutomationWriteTargets {
	snapshotById: Map<string, RunCaseVerdictSnapshotRow>;
	targets: AutomationVerdictItem[];
}

async function writeAutomationTargets(
	tx: DbTransaction,
	input: ApplyAutomationVerdictsInput,
	run: TestRun,
	{ snapshotById, targets }: AutomationWriteTargets
): Promise<{ run: TestRun; updatedRunCaseIds: string[] }> {
	if (targets.length === 0) {
		return { run, updatedRunCaseIds: [] };
	}
	const updatedRunCaseIds = await updateAutomationVerdictRows(
		tx,
		input,
		targets
	);
	await insertRunCaseEventRows(
		tx,
		buildAutomationEventRows(input.actorId, targets, snapshotById)
	);
	return {
		run: await applyRunStatusDerivation(tx, { actorId: input.actorId, run }),
		updatedRunCaseIds,
	};
}

export function applyAutomationVerdicts(
	input: ApplyAutomationVerdictsInput
): Promise<ApplyAutomationVerdictsOutcome> {
	return db.transaction(async (tx) => {
		assertAutomationVerdictItems(input.items);
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		if (run.status === "pending_review") {
			return { kind: "review-pending" as const };
		}
		const runCaseIds = dedupe(input.items.map((item) => item.runCaseId));
		const lookup = await loadAutomationSnapshots(tx, run.id, runCaseIds);
		if (lookup.kind !== "ok") {
			return lookup;
		}
		const { snapshotById } = lookup;
		const { skippedRunCaseIds, targets } = partitionAutomationTargets(
			input.items,
			snapshotById,
			input.overwriteManual
		);
		const written = await writeAutomationTargets(tx, input, run, {
			snapshotById,
			targets,
		});
		return {
			kind: "ok" as const,
			run: written.run,
			skippedRunCaseIds,
			updatedRunCaseIds: written.updatedRunCaseIds,
		};
	});
}
