import { count, eq } from "drizzle-orm";

import { db } from "../index";
import { type JiraConfig, jiraConfigs } from "../schema/integrations";
import { type CaseStep, testCases } from "../schema/test-cases";
import { testRunAttachments } from "../schema/test-run-attachments";
import {
	type TestRunCaseResult,
	testRunCases,
	testRuns,
} from "../schema/test-runs";

export async function getJiraConfig(
	projectId: string
): Promise<JiraConfig | null> {
	const [row] = await db
		.select()
		.from(jiraConfigs)
		.where(eq(jiraConfigs.projectId, projectId))
		.limit(1);
	return row ?? null;
}

export interface UpsertJiraConfigInput {
	apiTokenCipher?: string;
	defaultIssueType: string;
	email: string;
	projectId: string;
	projectKey: string;
	siteUrl: string;
	updatedBy: string | null;
	webhookSecret?: string | null;
}

export type UpsertJiraConfigResult =
	| { kind: "ok"; row: JiraConfig }
	| { kind: "token-required" };

function buildUpdateSet(
	input: UpsertJiraConfigInput
): Record<string, string | null> {
	const patch: Record<string, string | null> = {
		defaultIssueType: input.defaultIssueType,
		email: input.email,
		projectKey: input.projectKey,
		siteUrl: input.siteUrl,
		updatedBy: input.updatedBy,
	};
	if (input.apiTokenCipher !== undefined) {
		patch.apiTokenCipher = input.apiTokenCipher;
	}
	if (input.webhookSecret !== undefined) {
		patch.webhookSecret = input.webhookSecret;
	}
	return patch;
}

export async function upsertJiraConfig(
	input: UpsertJiraConfigInput
): Promise<UpsertJiraConfigResult> {
	const cipher = input.apiTokenCipher;
	if (cipher === undefined) {
		const [updated] = await db
			.update(jiraConfigs)
			.set(buildUpdateSet(input))
			.where(eq(jiraConfigs.projectId, input.projectId))
			.returning();
		return updated ? { kind: "ok", row: updated } : { kind: "token-required" };
	}
	const [row] = await db
		.insert(jiraConfigs)
		.values({
			apiTokenCipher: cipher,
			defaultIssueType: input.defaultIssueType,
			email: input.email,
			projectId: input.projectId,
			projectKey: input.projectKey,
			siteUrl: input.siteUrl,
			updatedBy: input.updatedBy,
			webhookSecret: input.webhookSecret ?? null,
		})
		.onConflictDoUpdate({
			set: buildUpdateSet(input),
			target: jiraConfigs.projectId,
		})
		.returning();
	if (!row) {
		throw new Error("upsertJiraConfig: upsert returned no row");
	}
	return { kind: "ok", row };
}

export async function removeJiraConfig(projectId: string): Promise<boolean> {
	const removed = await db
		.delete(jiraConfigs)
		.where(eq(jiraConfigs.projectId, projectId))
		.returning({ id: jiraConfigs.id });
	return removed.length > 0;
}

export interface DefectContext {
	attachmentCount: number;
	caseName: string;
	casePreconditions: string | null;
	caseSteps: CaseStep[];
	comment: string | null;
	defectKey: string | null;
	projectId: string;
	result: TestRunCaseResult;
	runId: string;
	runName: string;
	submittedAt: Date | null;
	voidedAt: Date | null;
}

export async function getDefectContext(
	runCaseId: string
): Promise<DefectContext | null> {
	const [row] = await db
		.select({
			caseName: testCases.name,
			casePreconditions: testCases.preconditions,
			caseSteps: testCases.steps,
			comment: testRunCases.comment,
			defectKey: testRunCases.defectKey,
			projectId: testRuns.projectId,
			result: testRunCases.result,
			runId: testRuns.id,
			runName: testRuns.name,
			submittedAt: testRuns.submittedAt,
			voidedAt: testRuns.voidedAt,
		})
		.from(testRunCases)
		.innerJoin(testRuns, eq(testRuns.id, testRunCases.runId))
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.where(eq(testRunCases.id, runCaseId))
		.limit(1);
	if (!row) {
		return null;
	}
	const [attachments] = await db
		.select({ value: count() })
		.from(testRunAttachments)
		.where(eq(testRunAttachments.runCaseId, runCaseId));
	return { ...row, attachmentCount: attachments?.value ?? 0 };
}
