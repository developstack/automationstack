import { and, asc, eq, inArray, max } from "drizzle-orm";

import { db } from "../index";
import { modules } from "../schema/modules";
import { testCases } from "../schema/test-cases";
import { testRunCases, testRuns } from "../schema/test-runs";
import {
	buildExecutionCoverage,
	type CoverageExecutionRow,
	type ExecutionCoverageCore,
	type UnexecutedCase,
} from "./project-stats-execution-core";
import {
	lastExecutionConditions,
	latestResultConditions,
} from "./project-stats-filter-core";
import {
	buildLatestResults,
	type LatestResultRow,
	type LatestResultsStats,
} from "./project-stats-latest-core";

export type ExecutionCoverageStats = Omit<
	ExecutionCoverageCore,
	"unexecutedHighPriority"
> & {
	unexecutedHighPriority: {
		items: (UnexecutedCase & { name: string })[];
		total: number;
	};
};

/** 生效用例在每个已执行结果（通过、失败）下最后一次的执行时间。不包含已作废的测试任务。 */
async function queryLastExecutions(
	projectId: string
): Promise<CoverageExecutionRow[]> {
	const rows = await db
		.select({
			caseId: testRunCases.caseId,
			lastAt: max(testRunCases.executedAt),
			result: testRunCases.result,
		})
		.from(testRunCases)
		.innerJoin(testRuns, eq(testRunCases.runId, testRuns.id))
		.innerJoin(testCases, eq(testRunCases.caseId, testCases.id))
		.where(and(...lastExecutionConditions(projectId)))
		.groupBy(testRunCases.caseId, testRunCases.result);
	return rows.flatMap(({ caseId, lastAt, result }) =>
		lastAt === null ? [] : [{ caseId, lastAt, result }]
	);
}

async function withCaseNames(
	items: readonly UnexecutedCase[]
): Promise<ExecutionCoverageStats["unexecutedHighPriority"]["items"]> {
	if (items.length === 0) {
		return [];
	}
	const rows = await db
		.select({ id: testCases.id, name: testCases.name })
		.from(testCases)
		.where(
			inArray(
				testCases.id,
				items.map((item) => item.id)
			)
		);
	const names = new Map(rows.map((row) => [row.id, row.name]));
	return items.map((item) => ({ ...item, name: names.get(item.id) ?? "" }));
}

/** M4 执行覆盖率。 */
export async function getExecutionCoverage(
	projectId: string,
	now: Date = new Date()
): Promise<ExecutionCoverageStats> {
	const [cases, executions, moduleRows] = await Promise.all([
		db
			.select({
				id: testCases.id,
				moduleId: testCases.moduleId,
				priority: testCases.priority,
			})
			.from(testCases)
			.where(
				and(eq(testCases.projectId, projectId), eq(testCases.status, "active"))
			),
		queryLastExecutions(projectId),
		db
			.select({
				id: modules.id,
				name: modules.name,
				parentId: modules.parentId,
			})
			.from(modules)
			.where(eq(modules.projectId, projectId))
			.orderBy(asc(modules.sortOrder), asc(modules.name)),
	]);
	const coverage = buildExecutionCoverage({
		cases,
		executions,
		modules: moduleRows,
		now,
	});
	const { items, total } = coverage.unexecutedHighPriority;
	return {
		...coverage,
		unexecutedHighPriority: { items: await withCaseNames(items), total },
	};
}

/** M5 生效用例的最新执行结果：取过去 30 天内有结论的执行结果，不取自已作废的测试任务。 */
export async function getLatestResults(
	projectId: string,
	now: Date = new Date()
): Promise<LatestResultsStats> {
	const rows = await db
		.select({
			caseId: testRunCases.caseId,
			executedAt: testRunCases.executedAt,
			priority: testCases.priority,
			result: testRunCases.result,
		})
		.from(testRunCases)
		.innerJoin(testRuns, eq(testRunCases.runId, testRuns.id))
		.innerJoin(testCases, eq(testRunCases.caseId, testCases.id))
		.where(and(...latestResultConditions(projectId, now)));
	const executions: LatestResultRow[] = [];
	for (const { executedAt, ...row } of rows) {
		if (executedAt !== null) {
			executions.push({ ...row, executedAt });
		}
	}
	return buildLatestResults({ executions, now });
}
