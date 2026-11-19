// 项目概览中读取测试任务的统计的查询条件。这个文件没有数据库依赖，测试直接比较生成的 SQL。

import {
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	ne,
	type SQL,
	sql,
} from "drizzle-orm";

import { testCases } from "../schema/test-cases";
import {
	type TestRunStatus,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import {
	daysBefore,
	EXECUTED_RESULTS,
	EXECUTION_WINDOW_DAYS,
	trendStart,
} from "./project-stats-definitions";

/** 已作废的测试任务不代表一次有效的测试，不计入项目概览的任何统计（ADR 0004）。 */
const NOT_COUNTED_STATUS: TestRunStatus = "voided";

/** 计入统计的测试任务：属于这个项目，并且没有作废。 */
function countedRunConditions(projectId: string): SQL[] {
	return [
		eq(testRuns.projectId, projectId),
		ne(testRuns.status, NOT_COUNTED_STATUS),
	];
}

/** M3 进行中的测试任务：还没有提交，也没有作废。 */
export function activeRunConditions(projectId: string): SQL[] {
	return [...countedRunConditions(projectId), isNull(testRuns.submittedAt)];
}

/** M4 执行覆盖率：生效用例在计入统计的测试任务中通过或失败的执行。 */
export function lastExecutionConditions(projectId: string): SQL[] {
	return [
		...countedRunConditions(projectId),
		eq(testCases.status, "active"),
		inArray(testRunCases.result, [...EXECUTED_RESULTS]),
		isNotNull(testRunCases.executedAt),
	];
}

/** M5 最新执行结果：生效用例在计入统计的测试任务中、过去 30 天内有结论的执行。 */
export function latestResultConditions(projectId: string, now: Date): SQL[] {
	return [
		...countedRunConditions(projectId),
		eq(testCases.status, "active"),
		ne(testRunCases.result, "untested"),
		gte(testRunCases.executedAt, daysBefore(now, EXECUTION_WINDOW_DAYS)),
	];
}

/** M6 每周执行结果：计入统计的测试任务中、第一个区间开始后有结论的执行。 */
export function executionTrendConditions(projectId: string, now: Date): SQL[] {
	return [
		...countedRunConditions(projectId),
		ne(testRunCases.result, "untested"),
		gte(testRunCases.executedAt, trendStart(now)),
	];
}

/** M7 测试任务新建和完成趋势：第一个区间开始后新建或完成的、计入统计的测试任务。 */
export function runTrendConditions(projectId: string, now: Date): SQL[] {
	const since = trendStart(now);
	return [
		...countedRunConditions(projectId),
		// drizzle 的 or() 返回 SQL | undefined，这里直接写 or，不用类型断言
		sql`(${gte(testRuns.createdAt, since)} or ${gte(testRuns.completedAt, since)})`,
	];
}
