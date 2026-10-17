import { eq, inArray } from "drizzle-orm";

import { db } from "../index";
import { modules } from "../schema/modules";
import { testCases } from "../schema/test-cases";
import { testRunAttachments } from "../schema/test-run-attachments";
import { testRunCases, testRuns } from "../schema/test-runs";

export async function getProjectIdByCaseId(
	caseId: string
): Promise<string | null> {
	const [row] = await db
		.select({ projectId: testCases.projectId })
		.from(testCases)
		.where(eq(testCases.id, caseId))
		.limit(1);
	return row?.projectId ?? null;
}

export interface CaseProject {
	caseId: string;
	projectId: string;
}

/** 每条用例所在的项目。不存在的用例不在结果中。 */
export function listCaseProjects(
	caseIds: readonly string[]
): Promise<CaseProject[]> {
	return db
		.select({ caseId: testCases.id, projectId: testCases.projectId })
		.from(testCases)
		.where(inArray(testCases.id, [...caseIds]));
}

export async function getProjectIdByModuleId(
	moduleId: string
): Promise<string | null> {
	const [row] = await db
		.select({ projectId: modules.projectId })
		.from(modules)
		.where(eq(modules.id, moduleId))
		.limit(1);
	return row?.projectId ?? null;
}

export async function getProjectIdByRunId(
	runId: string
): Promise<string | null> {
	const [row] = await db
		.select({ projectId: testRuns.projectId })
		.from(testRuns)
		.where(eq(testRuns.id, runId))
		.limit(1);
	return row?.projectId ?? null;
}

export async function getProjectIdByRunCaseId(
	runCaseId: string
): Promise<string | null> {
	const [row] = await db
		.select({ projectId: testRuns.projectId })
		.from(testRunCases)
		.innerJoin(testRuns, eq(testRuns.id, testRunCases.runId))
		.where(eq(testRunCases.id, runCaseId))
		.limit(1);
	return row?.projectId ?? null;
}

export async function getProjectIdByRunAttachmentId(
	attachmentId: string
): Promise<string | null> {
	const [row] = await db
		.select({ projectId: testRuns.projectId })
		.from(testRunAttachments)
		.innerJoin(testRunCases, eq(testRunCases.id, testRunAttachments.runCaseId))
		.innerJoin(testRuns, eq(testRuns.id, testRunCases.runId))
		.where(eq(testRunAttachments.id, attachmentId))
		.limit(1);
	return row?.projectId ?? null;
}

export interface MindmapNodeIds {
	caseIds: string[];
	moduleIds: string[];
}

export async function listProjectIdsByMindmapNodes(
	nodes: MindmapNodeIds
): Promise<string[]> {
	const [caseRows, moduleRows] = await Promise.all([
		nodes.caseIds.length === 0
			? []
			: db
					.selectDistinct({ projectId: testCases.projectId })
					.from(testCases)
					.where(inArray(testCases.id, nodes.caseIds)),
		nodes.moduleIds.length === 0
			? []
			: db
					.selectDistinct({ projectId: modules.projectId })
					.from(modules)
					.where(inArray(modules.id, nodes.moduleIds)),
	]);
	return [...new Set([...caseRows, ...moduleRows].map((row) => row.projectId))];
}
