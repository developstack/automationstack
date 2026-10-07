import {
	type NewTestRunCaseEvent,
	testRunCaseEvents,
} from "../schema/test-run-case-events";
import type { DbTransaction } from "./repository-types";
import {
	type BuildRunCaseEventRowsInput,
	buildRunCaseEventRows,
} from "./test-run-case-events-core";

export async function insertRunCaseEventRows(
	tx: DbTransaction,
	rows: NewTestRunCaseEvent[]
): Promise<void> {
	if (rows.length === 0) {
		return;
	}
	await tx.insert(testRunCaseEvents).values(rows);
}

export async function insertRunCaseEvents(
	tx: DbTransaction,
	input: BuildRunCaseEventRowsInput
): Promise<void> {
	await insertRunCaseEventRows(tx, buildRunCaseEventRows(input));
}
