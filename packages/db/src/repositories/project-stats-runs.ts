import { and, eq, isNull, max } from "drizzle-orm";

import { db } from "../index";
import { testRunCases, testRuns } from "../schema/test-runs";
import {
	type ActiveRunsStats,
	buildActiveRuns,
} from "./project-stats-runs-core";
import { countWhere } from "./project-stats-sql";

/** M3：还没有提交的测试任务，每个测试任务按执行结果计数，并取最后的执行时间。 */
export async function getActiveRuns(
	projectId: string,
	now: Date = new Date()
): Promise<ActiveRunsStats> {
	const rows = await db
		.select({
			blocked: countWhere(eq(testRunCases.result, "blocked")),
			createdAt: testRuns.createdAt,
			failed: countWhere(eq(testRunCases.result, "failed")),
			id: testRuns.id,
			lastExecutedAt: max(testRunCases.executedAt),
			name: testRuns.name,
			passed: countWhere(eq(testRunCases.result, "passed")),
			skipped: countWhere(eq(testRunCases.result, "skipped")),
			status: testRuns.status,
			untested: countWhere(eq(testRunCases.result, "untested")),
		})
		.from(testRuns)
		.leftJoin(testRunCases, eq(testRunCases.runId, testRuns.id))
		.where(and(eq(testRuns.projectId, projectId), isNull(testRuns.submittedAt)))
		.groupBy(testRuns.id);
	return buildActiveRuns({
		now,
		runs: rows.map((row) => ({
			counts: {
				blocked: row.blocked,
				failed: row.failed,
				passed: row.passed,
				skipped: row.skipped,
				untested: row.untested,
			},
			createdAt: row.createdAt,
			id: row.id,
			lastExecutedAt: row.lastExecutedAt,
			name: row.name,
			status: row.status,
		})),
	});
}
