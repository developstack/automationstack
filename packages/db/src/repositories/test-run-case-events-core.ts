import type { NewTestRunCaseEvent } from "../schema/test-run-case-events";
import type {
	TestRunCaseResult,
	TestRunExecutedVia,
} from "../schema/test-runs";

export interface RunCaseVerdictSnapshot {
	comment: string | null;
	executedVia?: TestRunExecutedVia | null;
	id: string;
	result: TestRunCaseResult;
}

export interface BuildRunCaseEventRowsInput {
	actorId: string | null;
	automationTakeover?: boolean;
	comment?: string | null;
	snapshots: RunCaseVerdictSnapshot[];
	toResult: TestRunCaseResult;
}

function isAutomationTakeover(
	input: BuildRunCaseEventRowsInput,
	snapshot: RunCaseVerdictSnapshot
): boolean {
	return (
		input.automationTakeover === true &&
		snapshot.result === input.toResult &&
		snapshot.executedVia === "manual"
	);
}

function pickEventComment(
	input: BuildRunCaseEventRowsInput,
	snapshot: RunCaseVerdictSnapshot,
	isTakeover: boolean
): string | null {
	if (isTakeover || input.toResult === "untested") {
		return snapshot.comment;
	}
	return input.comment === undefined ? snapshot.comment : input.comment;
}

export function buildRunCaseEventRows(
	input: BuildRunCaseEventRowsInput
): NewTestRunCaseEvent[] {
	const rows: NewTestRunCaseEvent[] = [];
	for (const snapshot of input.snapshots) {
		const isTakeover = isAutomationTakeover(input, snapshot);
		if (!isTakeover && snapshot.result === input.toResult) {
			continue;
		}
		rows.push({
			actorId: input.actorId,
			comment: pickEventComment(input, snapshot, isTakeover),
			fromResult: snapshot.result,
			runCaseId: snapshot.id,
			toResult: input.toResult,
		});
	}
	return rows;
}
