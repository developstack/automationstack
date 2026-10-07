import { count, desc, eq, sql } from "drizzle-orm";

import { db } from "../index";
import { automationExecutions } from "../schema/automation-executions";
import { testCases } from "../schema/test-cases";
import { testRunCases } from "../schema/test-runs";
import { users } from "../schema/users";

function skippedForRun(runId: string, runName: string) {
	return sql<number>`(
		select count(*)
		from jsonb_array_elements(
			coalesce(${automationExecutions.receipt} -> 'skippedManual', '[]'::jsonb)
		) as skipped_entry
		where skipped_entry ->> 'runName' = ${runName}
			and exists (
				select 1
				from ${testRunCases} as skipped_run_case
				join ${testCases} as skipped_case
					on skipped_case.id = skipped_run_case.case_id
				where skipped_run_case.run_id = ${runId}
					and skipped_case.source_ref = skipped_entry ->> 'sourceRef'
			)
	)`.mapWith(Number);
}

export interface TestRunAutomationExecution {
	branch: string | null;
	ciUrl: string | null;
	commitSha: string | null;
	completedAt: Date | null;
	executionId: string;
	finishedAt: Date | null;
	reportedAt: Date;
	reportedByName: string | null;
	skippedCount: number;
	updatedCount: number;
}

export function loadAutomationExecutions(
	runId: string,
	runName: string
): Promise<TestRunAutomationExecution[]> {
	return db
		.select({
			branch: automationExecutions.branch,
			ciUrl: automationExecutions.ciUrl,
			commitSha: automationExecutions.commitSha,
			completedAt: automationExecutions.completedAt,
			executionId: automationExecutions.id,
			finishedAt: automationExecutions.finishedAt,
			reportedAt: automationExecutions.createdAt,
			reportedByName: users.username,
			skippedCount: skippedForRun(runId, runName),
			updatedCount: count(testRunCases.id),
		})
		.from(testRunCases)
		.innerJoin(
			automationExecutions,
			eq(automationExecutions.id, testRunCases.lastAutomationExecutionId)
		)
		.leftJoin(users, eq(users.id, automationExecutions.reportedBy))
		.where(eq(testRunCases.runId, runId))
		.groupBy(automationExecutions.id, users.id)
		.orderBy(desc(automationExecutions.createdAt));
}
