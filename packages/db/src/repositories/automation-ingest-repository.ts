import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "../index";
import {
	type TestRunStatus,
	testRunCases,
	testRuns,
} from "../schema/test-runs";

export interface IngestRunSummary {
	caseCount: number;
	daysSinceLastVerdict: number;
	name: string;
	runId: string;
	status: TestRunStatus;
}

export function listIngestRunSummaries(
	projectId: string
): Promise<IngestRunSummary[]> {
	return db
		.select({
			caseCount: count(testRunCases.id),
			daysSinceLastVerdict:
				sql<number>`floor(extract(epoch from now() - coalesce(max(${testRunCases.executedAt}), ${testRuns.createdAt})) / 86400)::int`.mapWith(
					Number
				),
			name: testRuns.name,
			runId: testRuns.id,
			status: testRuns.status,
		})
		.from(testRuns)
		.leftJoin(testRunCases, eq(testRunCases.runId, testRuns.id))
		.where(
			and(
				eq(testRuns.projectId, projectId),
				isNull(testRuns.submittedAt),
				isNull(testRuns.voidedAt)
			)
		)
		.groupBy(testRuns.id)
		.orderBy(desc(testRuns.createdAt));
}

export type {
	AutomationExecutionRunSummary,
	CompleteAutomationExecutionInput,
	CreateAutomationExecutionInput,
	EnsureAutomationExecutionResult,
} from "./automation-execution-repository";
export {
	completeAutomationExecution,
	ensureAutomationExecution,
	summarizeAutomationExecutionRuns,
} from "./automation-execution-repository";
export type {
	AutomationTargetRow,
	FindSubmittedRunBlockersInput,
	ResolveAutomationTargetsInput,
	SubmittedRunBlocker,
} from "./automation-target-repository";
export {
	findSubmittedRunBlockers,
	resolveAutomationTargets,
} from "./automation-target-repository";
