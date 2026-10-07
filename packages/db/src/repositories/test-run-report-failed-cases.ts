import { and, asc, count, eq } from "drizzle-orm";

import { db } from "../index";
import { automationExecutions } from "../schema/automation-executions";
import { modules } from "../schema/modules";
import { type CasePriority, testCases } from "../schema/test-cases";
import { testRunAttachments } from "../schema/test-run-attachments";
import { type TestRunExecutedVia, testRunCases } from "../schema/test-runs";
import { users } from "../schema/users";

export interface TestRunFailedCaseAutomation {
	branch: string | null;
	ciUrl: string | null;
	commitSha: string | null;
	executionId: string;
	finishedAt: Date | null;
}

export interface TestRunFailedCase {
	attachmentCount: number;
	automationExecution: TestRunFailedCaseAutomation | null;
	caseId: string;
	comment: string | null;
	defectKey: string | null;
	defectStatus: string | null;
	defectTitle: string | null;
	defectUrl: string | null;
	executedAt: Date | null;
	executedByName: string | null;
	executedVia: TestRunExecutedVia | null;
	moduleName: string;
	name: string;
	priority: CasePriority;
	runCaseId: string;
}

function selectFailedCaseRows(runId: string) {
	return db
		.select({
			attachmentCount: count(testRunAttachments.id),
			automationBranch: automationExecutions.branch,
			automationCiUrl: automationExecutions.ciUrl,
			automationCommitSha: automationExecutions.commitSha,
			automationExecutionId: automationExecutions.id,
			automationFinishedAt: automationExecutions.finishedAt,
			caseId: testCases.id,
			comment: testRunCases.comment,
			defectKey: testRunCases.defectKey,
			defectStatus: testRunCases.defectStatus,
			defectTitle: testRunCases.defectTitle,
			defectUrl: testRunCases.defectUrl,
			executedAt: testRunCases.executedAt,
			executedByName: users.username,
			executedVia: testRunCases.executedVia,
			moduleName: modules.name,
			name: testCases.name,
			priority: testCases.priority,
			runCaseId: testRunCases.id,
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.innerJoin(modules, eq(modules.id, testCases.moduleId))
		.leftJoin(users, eq(users.id, testRunCases.executedBy))
		.leftJoin(
			automationExecutions,
			eq(automationExecutions.id, testRunCases.lastAutomationExecutionId)
		)
		.leftJoin(
			testRunAttachments,
			eq(testRunAttachments.runCaseId, testRunCases.id)
		)
		.where(
			and(eq(testRunCases.runId, runId), eq(testRunCases.result, "failed"))
		)
		.groupBy(
			testRunCases.id,
			testCases.id,
			modules.id,
			users.id,
			automationExecutions.id
		)
		.orderBy(asc(testCases.priority), asc(testRunCases.sortOrder));
}

type FailedCaseRow = Awaited<ReturnType<typeof selectFailedCaseRows>>[number];

function toFailedCase(row: FailedCaseRow): TestRunFailedCase {
	const {
		automationBranch,
		automationCiUrl,
		automationCommitSha,
		automationExecutionId,
		automationFinishedAt,
		...rest
	} = row;
	return {
		...rest,
		automationExecution:
			automationExecutionId === null
				? null
				: {
						branch: automationBranch,
						ciUrl: automationCiUrl,
						commitSha: automationCommitSha,
						executionId: automationExecutionId,
						finishedAt: automationFinishedAt,
					},
	};
}

export async function loadFailedCases(
	runId: string
): Promise<TestRunFailedCase[]> {
	const rows = await selectFailedCaseRows(runId);
	return rows.map(toFailedCase);
}
