import {
	type NewTestRunCaseEvent,
	testRunCaseEvents,
} from "../schema/test-run-case-events";
import type { DbTransaction } from "./repository-types";
import {
	type BuildRunCaseEventRowsInput,
	buildRunCaseEventRows,
} from "./test-run-case-events-core";

/**
 * 结论审计流水的**写侧原语**（读侧在 `test-run-case-events-repository.ts`）。
 *
 * 单独成文件是因为它有三个调用方——手工单条、手工批量（都在
 * `test-run-verdicts-repository.ts`）与自动化上报（`test-run-automation-verdicts.ts`）——
 * 而「结论与流水同生共死」这条要求正是靠三条路径调同一个函数来兑现的。
 * 挂在其中任何一条路径的文件里，另外两条就得反向 import 它，
 * 读的人会误以为那条路径才是主人。
 */

/**
 * 落审计流水：**一条多行 INSERT**，且没有可记的行时一条 SQL 都不发。
 *
 * 单条与批量两条路径共用它，是为了让「什么时候不记、说明记哪一段」
 * 只有 `buildRunCaseEventRows` 一处判定；两边各写各的迟早会漂成两套语义。
 */
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
