import { asc, eq, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../index";
import { modules } from "../schema/modules";
import {
	type CasePriority,
	type CaseStatus,
	type CaseStep,
	testCases,
} from "../schema/test-cases";
import {
	type TestRun,
	type TestRunCase,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import { users } from "../schema/users";
import { runCaseModuleId } from "./run-case-module";
import { settleAutoSubmitForRun } from "./test-run-auto-submit-repository";

export interface TestRunLiveCase {
	currentVersion: number;
	id: string;
	maintainer: string | null;
	moduleId: string;
	moduleName: string;
	name: string;
	preconditions: string | null;
	priority: CasePriority;
	status: CaseStatus;
	steps: CaseStep[];
	updatedAt: Date;
}

export interface TestRunCaseDetail {
	executedByName: string | null;
	runCase: TestRunCase;
	testCase: TestRunLiveCase;
}

export interface TestRunDetail {
	cases: TestRunCaseDetail[];
	createdByName: string | null;
	run: TestRun;
	submittedByName: string | null;
	voidedByName: string | null;
}

async function loadRunHeader(runId: string) {
	const creator = alias(users, "creator");
	const submitter = alias(users, "submitter");
	const voider = alias(users, "voider");
	const [row] = await db
		.select({
			createdByName: creator.username,
			run: testRuns,
			submittedByName: submitter.username,
			voidedByName: voider.username,
		})
		.from(testRuns)
		.leftJoin(creator, eq(creator.id, testRuns.createdBy))
		.leftJoin(submitter, eq(submitter.id, testRuns.submittedBy))
		.leftJoin(voider, eq(voider.id, testRuns.voidedBy))
		.where(eq(testRuns.id, runId))
		.limit(1);
	return row ?? null;
}

async function loadRunCaseRows(runId: string) {
	const executor = alias(users, "executor");
	return await db
		.select({
			...getTableColumns(testRunCases),
			caseCurrentVersion: testCases.currentVersion,
			caseMaintainer: testCases.maintainer,
			caseModuleId: modules.id,
			caseModuleName: modules.name,
			caseName: testCases.name,
			casePreconditions: testCases.preconditions,
			casePriority: testCases.priority,
			caseStatus: testCases.status,
			caseSteps: testCases.steps,
			caseUpdatedAt: testCases.updatedAt,
			executedByName: executor.username,
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.innerJoin(modules, eq(modules.id, runCaseModuleId))
		.leftJoin(executor, eq(executor.id, testRunCases.executedBy))
		.where(eq(testRunCases.runId, runId))
		.orderBy(asc(testRunCases.sortOrder), asc(testRunCases.createdAt));
}

type TestRunCaseRow = Awaited<ReturnType<typeof loadRunCaseRows>>[number];

function toRunCaseDetail({
	caseCurrentVersion,
	caseMaintainer,
	caseModuleId,
	caseModuleName,
	caseName,
	casePreconditions,
	casePriority,
	caseStatus,
	caseSteps,
	caseUpdatedAt,
	executedByName,
	...runCase
}: TestRunCaseRow): TestRunCaseDetail {
	return {
		executedByName,
		runCase,
		testCase: {
			currentVersion: caseCurrentVersion,
			id: runCase.caseId,
			maintainer: caseMaintainer,
			moduleId: caseModuleId,
			moduleName: caseModuleName,
			name: caseName,
			preconditions: casePreconditions,
			priority: casePriority,
			status: caseStatus,
			steps: caseSteps,
			updatedAt: caseUpdatedAt,
		},
	};
}

export async function getTestRunDetail(
	runId: string
): Promise<TestRunDetail | null> {
	await settleAutoSubmitForRun(runId);
	const header = await loadRunHeader(runId);
	if (header === null) {
		return null;
	}
	const rows = await loadRunCaseRows(runId);
	return {
		cases: rows.map(toRunCaseDetail),
		createdByName: header.createdByName,
		run: header.run,
		submittedByName: header.submittedByName,
		voidedByName: header.voidedByName,
	};
}
