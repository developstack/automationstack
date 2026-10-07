import { and, asc, count, eq, sql } from "drizzle-orm";

import { db } from "../index";
import {
	type AutomationExecution,
	automationExecutions,
} from "../schema/automation-executions";
import { testRunCases, testRuns } from "../schema/test-runs";

export interface CreateAutomationExecutionInput {
	branch: string | null;
	ciUrl: string | null;
	commitSha: string | null;
	finishedAt: Date | null;
	idempotencyKey: string;
	projectId: string;
	reportedBy: string | null;
	startedAt: Date | null;
}

export type EnsureAutomationExecutionResult =
	| { execution: AutomationExecution; kind: "created" }
	| { execution: AutomationExecution; kind: "existing" };

export async function ensureAutomationExecution(
	input: CreateAutomationExecutionInput
): Promise<EnsureAutomationExecutionResult> {
	const [created] = await db
		.insert(automationExecutions)
		.values({
			branch: input.branch,
			ciUrl: input.ciUrl,
			commitSha: input.commitSha,
			finishedAt: input.finishedAt,
			idempotencyKey: input.idempotencyKey,
			projectId: input.projectId,
			reportedBy: input.reportedBy,
			startedAt: input.startedAt,
		})
		.onConflictDoNothing({
			target: [
				automationExecutions.projectId,
				automationExecutions.idempotencyKey,
			],
		})
		.returning();
	if (created) {
		return { execution: created, kind: "created" };
	}
	const [existing] = await db
		.select()
		.from(automationExecutions)
		.where(
			and(
				eq(automationExecutions.projectId, input.projectId),
				eq(automationExecutions.idempotencyKey, input.idempotencyKey)
			)
		)
		.limit(1);
	if (!existing) {
		throw new Error(
			`automation execution vanished after unique conflict: project=${input.projectId}`
		);
	}
	return { execution: existing, kind: "existing" };
}

export interface CompleteAutomationExecutionInput {
	id: string;
	receipt: unknown;
	skippedCount: number;
	updatedCount: number;
}

export async function completeAutomationExecution(
	input: CompleteAutomationExecutionInput
): Promise<void> {
	await db
		.update(automationExecutions)
		.set({
			completedAt: sql`now()`,
			receipt: input.receipt,
			skippedCount: input.skippedCount,
			updatedCount: input.updatedCount,
		})
		.where(eq(automationExecutions.id, input.id));
}

export interface AutomationExecutionRunSummary {
	runId: string;
	runName: string;
	updated: number;
}

export function summarizeAutomationExecutionRuns(
	executionId: string
): Promise<AutomationExecutionRunSummary[]> {
	return db
		.select({
			runId: testRuns.id,
			runName: testRuns.name,
			updated: count(testRunCases.id),
		})
		.from(testRunCases)
		.innerJoin(testRuns, eq(testRuns.id, testRunCases.runId))
		.where(eq(testRunCases.lastAutomationExecutionId, executionId))
		.groupBy(testRuns.id, testRuns.name)
		.orderBy(asc(testRuns.name));
}
