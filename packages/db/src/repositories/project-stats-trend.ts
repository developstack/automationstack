import { and, eq, gt, gte } from "drizzle-orm";

import { db } from "../index";
import { caseVersions, testCases } from "../schema/test-cases";
import { testRunCases, testRuns } from "../schema/test-runs";
import {
	daysBefore,
	RECENT_WINDOW_DAYS,
	trendStart,
} from "./project-stats-definitions";
import {
	executionTrendConditions,
	runTrendConditions,
} from "./project-stats-filter-core";
import {
	buildCaseTrend,
	buildExecutionTrend,
	buildRunTrend,
	type CaseTrendStats,
	type ExecutionRow,
	type ExecutionTrendStats,
	type RunTrendStats,
} from "./project-stats-trend-core";

/**
 * 只读查询的行只取时间窗口内的数据；区间的划分和计数在 project-stats-trend-core 中完成。
 * 读取测试任务的查询条件在 project-stats-filter-core 中，不包含已作废的测试任务。
 */

const FIRST_VERSION = 1;

export async function getCaseTrend(
	projectId: string,
	now: Date = new Date()
): Promise<CaseTrendStats> {
	const [created, modifiedVersions] = await Promise.all([
		db
			.select({ createdAt: testCases.createdAt })
			.from(testCases)
			.where(
				and(
					eq(testCases.projectId, projectId),
					gte(testCases.createdAt, trendStart(now))
				)
			),
		db
			.select({
				caseId: caseVersions.caseId,
				createdAt: caseVersions.createdAt,
			})
			.from(caseVersions)
			.innerJoin(testCases, eq(caseVersions.caseId, testCases.id))
			.where(
				and(
					eq(testCases.projectId, projectId),
					gt(caseVersions.version, FIRST_VERSION),
					gte(caseVersions.createdAt, daysBefore(now, RECENT_WINDOW_DAYS))
				)
			),
	]);
	return buildCaseTrend({
		caseCreatedAt: created.map((row) => row.createdAt),
		modifiedVersions,
		now,
	});
}

export async function getExecutionTrend(
	projectId: string,
	now: Date = new Date()
): Promise<ExecutionTrendStats> {
	const rows = await db
		.select({
			executedAt: testRunCases.executedAt,
			result: testRunCases.result,
		})
		.from(testRunCases)
		.innerJoin(testRuns, eq(testRunCases.runId, testRuns.id))
		.where(and(...executionTrendConditions(projectId, now)));
	const executions: ExecutionRow[] = [];
	for (const { executedAt, result } of rows) {
		if (executedAt !== null) {
			executions.push({ executedAt, result });
		}
	}
	return buildExecutionTrend({ executions, now });
}

export async function getRunTrend(
	projectId: string,
	now: Date = new Date()
): Promise<RunTrendStats> {
	const runs = await db
		.select({
			completedAt: testRuns.completedAt,
			createdAt: testRuns.createdAt,
			status: testRuns.status,
		})
		.from(testRuns)
		.where(and(...runTrendConditions(projectId, now)));
	return buildRunTrend({ now, runs });
}
