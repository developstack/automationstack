import { type SQL, sql } from "drizzle-orm";

import { testCases } from "../schema/test-cases";
import {
	type TestRunCaseResult,
	type TestRunExecutedVia,
	testRunCases,
} from "../schema/test-runs";
import {
	EMPTY_STEP_RESULTS_SQL,
	uniformStepResultsSql,
} from "./test-run-step-results-sql";

export interface ResultPatchInput {
	actorId: string | null;
	comment?: string | null;
	result: TestRunCaseResult;
	via: TestRunExecutedVia;
}

export interface RunCaseResultPatch {
	caseVersion?: SQL | null;
	comment?: string | null;
	executedAt?: Date | null;
	executedBy?: string | null;
	executedVia?: TestRunExecutedVia | null;
	lastAutomationExecutionId?: string | null;
	result: TestRunCaseResult;
	stepResults?: SQL;
}

export function buildResultPatch(input: ResultPatchInput): RunCaseResultPatch {
	const patch: RunCaseResultPatch = { result: input.result };
	if (input.comment !== undefined) {
		patch.comment = input.comment;
	}
	if (input.result === "untested") {
		patch.caseVersion = null;
		patch.comment = null;
		patch.executedAt = null;
		patch.executedBy = null;
		patch.executedVia = null;
		patch.lastAutomationExecutionId = null;
		patch.stepResults = EMPTY_STEP_RESULTS_SQL;
		return patch;
	}
	patch.stepResults = uniformStepResultsSql({
		result: sql`${input.result}::text`,
	});
	patch.executedAt = new Date();
	patch.executedBy = input.actorId;
	patch.executedVia = input.via;
	if (input.via === "manual") {
		patch.lastAutomationExecutionId = null;
	}
	patch.caseVersion = sql`(select ${testCases.currentVersion} from ${testCases} where ${testCases.id} = ${testRunCases.caseId})`;
	return patch;
}
