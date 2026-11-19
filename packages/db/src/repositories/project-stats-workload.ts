import {
	type AnyColumn,
	and,
	eq,
	gte,
	isNotNull,
	type SQL,
	sql,
} from "drizzle-orm";

import { db } from "../index";
import { caseActivities } from "../schema/case-activities";
import { projectMembers } from "../schema/project-members";
import { testRunCaseEvents } from "../schema/test-run-case-events";
import { testRunCases, testRuns } from "../schema/test-runs";
import { users } from "../schema/users";
import {
	daysBefore,
	EXECUTION_WINDOW_DAYS,
	RECENT_WINDOW_DAYS,
} from "./project-stats-definitions";
import { memberExecutionConditions } from "./project-stats-filter-core";
import { countWhere } from "./project-stats-sql";
import {
	type ActorCountRow,
	buildWorkload,
	type WorkloadStats,
} from "./project-stats-workload-core";

/** column 的不同值的个数。有 condition 时，只数满足条件的行。 */
function countDistinct(column: AnyColumn, condition?: SQL): SQL<number> {
	const filter = condition ? sql` filter (where ${condition})` : sql``;
	return sql<number>`count(distinct ${column})${filter}`.mapWith(Number);
}

/** 每个成员手动判定过的测试任务用例数。同一条测试任务用例判定多次只算一次。 */
function countExecutedByActor(
	projectId: string,
	now: Date
): Promise<ActorCountRow[]> {
	const recent = gte(
		testRunCaseEvents.createdAt,
		daysBefore(now, RECENT_WINDOW_DAYS)
	);
	return db
		.select({
			actorId: sql<string>`${testRunCaseEvents.actorId}`,
			last7Days: countDistinct(testRunCaseEvents.runCaseId, recent),
			last30Days: countDistinct(testRunCaseEvents.runCaseId),
			username: users.username,
		})
		.from(testRunCaseEvents)
		.innerJoin(testRunCases, eq(testRunCases.id, testRunCaseEvents.runCaseId))
		.innerJoin(testRuns, eq(testRuns.id, testRunCases.runId))
		.innerJoin(users, eq(users.id, testRunCaseEvents.actorId))
		.where(and(...memberExecutionConditions(projectId, now)))
		.groupBy(testRunCaseEvents.actorId, users.username);
}

/** 每个成员新建的用例数，包括导入的用例。用例删除后仍然计入。 */
function countCreatedByActor(
	projectId: string,
	now: Date
): Promise<ActorCountRow[]> {
	return db
		.select({
			actorId: sql<string>`${caseActivities.actorId}`,
			last7Days: countWhere(
				gte(caseActivities.createdAt, daysBefore(now, RECENT_WINDOW_DAYS))
			),
			last30Days: sql<number>`count(*)`.mapWith(Number),
			username: users.username,
		})
		.from(caseActivities)
		.innerJoin(users, eq(users.id, caseActivities.actorId))
		.where(
			and(
				eq(caseActivities.projectId, projectId),
				eq(caseActivities.action, "created"),
				isNotNull(caseActivities.actorId),
				gte(caseActivities.createdAt, daysBefore(now, EXECUTION_WINDOW_DAYS))
			)
		)
		.groupBy(caseActivities.actorId, users.username);
}

function listWorkloadMembers(projectId: string) {
	return db
		.select({
			disabled: sql<boolean>`${users.disabledAt} is not null`,
			userId: users.id,
			username: users.username,
		})
		.from(projectMembers)
		.innerJoin(users, eq(users.id, projectMembers.userId))
		.where(eq(projectMembers.projectId, projectId));
}

/** 成员工作量：每个成员在近 7 天和近 30 天中执行的用例数和新建的用例数。 */
export async function getMemberWorkload(
	projectId: string,
	now: Date = new Date()
): Promise<WorkloadStats> {
	const [executed, created, members] = await Promise.all([
		countExecutedByActor(projectId, now),
		countCreatedByActor(projectId, now),
		listWorkloadMembers(projectId),
	]);
	return buildWorkload({ created, executed, members });
}
