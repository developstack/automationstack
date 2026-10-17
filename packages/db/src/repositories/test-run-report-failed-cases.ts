import { and, asc, eq } from "drizzle-orm";

import { db } from "../index";
import { automationExecutions } from "../schema/automation-executions";
import { modules } from "../schema/modules";
import {
	type CasePriority,
	type CaseStep,
	testCases,
} from "../schema/test-cases";
import type { TestRunAttachment } from "../schema/test-run-attachments";
import type { RunCaseStepResult } from "../schema/test-run-enums";
import { type TestRunExecutedVia, testRunCases } from "../schema/test-runs";
import { users } from "../schema/users";
import { listAttachmentsForRunCases } from "./test-run-attachments-repository";

export interface TestRunFailedCaseAutomation {
	branch: string | null;
	ciUrl: string | null;
	commitSha: string | null;
	executionId: string;
	finishedAt: Date | null;
}

/** 报告中失败用例的一个当前步骤，以及它在这个测试任务中的实际结果文字。 */
export interface TestRunReportStep {
	actualResult: string | null;
	id: string;
	/** 步骤序号，从 1 开始。 */
	position: number;
	step: string;
}

export interface TestRunFailedCase {
	/**
	 * 这条用例的全部附件，按上传顺序：当前步骤的实际附件、整条用例的附件，
	 * 以及已删除步骤的实际附件。界面按 stepId 和 steps 分组。
	 */
	attachments: TestRunAttachment[];
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
	steps: TestRunReportStep[];
}

function selectFailedCaseRows(runId: string) {
	return db
		.select({
			automationBranch: automationExecutions.branch,
			automationCiUrl: automationExecutions.ciUrl,
			automationCommitSha: automationExecutions.commitSha,
			automationExecutionId: automationExecutions.id,
			automationFinishedAt: automationExecutions.finishedAt,
			caseId: testCases.id,
			caseSteps: testCases.steps,
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
			stepResults: testRunCases.stepResults,
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.innerJoin(modules, eq(modules.id, testCases.moduleId))
		.leftJoin(users, eq(users.id, testRunCases.executedBy))
		.leftJoin(
			automationExecutions,
			eq(automationExecutions.id, testRunCases.lastAutomationExecutionId)
		)
		.where(
			and(eq(testRunCases.runId, runId), eq(testRunCases.result, "failed"))
		)
		.orderBy(asc(testCases.priority), asc(testRunCases.sortOrder));
}

type FailedCaseRow = Awaited<ReturnType<typeof selectFailedCaseRows>>[number];

/** 用例当前的步骤，按顺序，每个步骤带上这个测试任务中的实际结果文字。 */
function toReportSteps(
	caseSteps: readonly CaseStep[],
	stepResults: readonly RunCaseStepResult[]
): TestRunReportStep[] {
	const actualResults = new Map(
		stepResults.map((item) => [item.stepId, item.actualResult])
	);
	return caseSteps.map((step, index) => ({
		actualResult: actualResults.get(step.id) ?? null,
		id: step.id,
		position: index + 1,
		step: step.step,
	}));
}

function toFailedCase(
	row: FailedCaseRow,
	attachments: TestRunAttachment[]
): TestRunFailedCase {
	const {
		automationBranch,
		automationCiUrl,
		automationCommitSha,
		automationExecutionId,
		automationFinishedAt,
		caseSteps,
		stepResults,
		...rest
	} = row;
	return {
		...rest,
		attachments,
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
		steps: toReportSteps(caseSteps, stepResults),
	};
}

/** 失败用例和它们的全部附件：两次查询，与失败用例的数量无关。 */
export async function loadFailedCases(
	runId: string
): Promise<TestRunFailedCase[]> {
	const rows = await selectFailedCaseRows(runId);
	const attachments = await listAttachmentsForRunCases(
		rows.map((row) => row.runCaseId)
	);
	const byRunCase = new Map<string, TestRunAttachment[]>();
	for (const attachment of attachments) {
		const group = byRunCase.get(attachment.runCaseId) ?? [];
		group.push(attachment);
		byRunCase.set(attachment.runCaseId, group);
	}
	return rows.map((row) =>
		toFailedCase(row, byRunCase.get(row.runCaseId) ?? [])
	);
}
