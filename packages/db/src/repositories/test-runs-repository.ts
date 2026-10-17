import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	getTableColumns,
	ilike,
	type SQL,
	sql,
} from "drizzle-orm";

import { db } from "../index";
import {
	type TestRun,
	type TestRunCaseResult,
	type TestRunStatus,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import { users } from "../schema/users";
import type { DbTransaction } from "./repository-types";
import { settleAutoSubmitForProject } from "./test-run-auto-submit-repository";

export interface TestRunResultCounts {
	blocked: number;
	failed: number;
	passed: number;
	skipped: number;
	total: number;
	untested: number;
}

export interface TestRunListItem {
	counts: TestRunResultCounts;
	createdByName: string | null;
	run: TestRun;
}

export interface ListTestRunsFilter {
	keyword?: string;
	projectId: string;
	status?: TestRunStatus;
}

function resultCount(result: TestRunCaseResult): SQL<number> {
	return sql<number>`count(${testRunCases.id}) filter (where ${testRunCases.result} = ${result}::test_run_case_result)`.mapWith(
		Number
	);
}

function buildListConditions(filter: ListTestRunsFilter): SQL[] {
	const conditions: SQL[] = [eq(testRuns.projectId, filter.projectId)];
	if (filter.status) {
		conditions.push(eq(testRuns.status, filter.status));
	}
	if (filter.keyword) {
		const escaped = filter.keyword.replace(/[%_\\]/g, "\\$&");
		conditions.push(ilike(testRuns.name, `%${escaped}%`));
	}
	return conditions;
}

export async function listTestRuns(
	projectId: string,
	filter: Omit<ListTestRunsFilter, "projectId"> = {}
): Promise<TestRunListItem[]> {
	await settleAutoSubmitForProject(projectId);
	const rows = await db
		.select({
			...getTableColumns(testRuns),
			blocked: resultCount("blocked"),
			createdByName: users.username,
			failed: resultCount("failed"),
			passed: resultCount("passed"),
			skipped: resultCount("skipped"),
			total: count(testRunCases.id),
			untested: resultCount("untested"),
		})
		.from(testRuns)
		.leftJoin(testRunCases, eq(testRunCases.runId, testRuns.id))
		.leftJoin(users, eq(users.id, testRuns.createdBy))
		.where(and(...buildListConditions({ ...filter, projectId })))
		.groupBy(testRuns.id, users.id)
		.orderBy(desc(testRuns.createdAt));
	return rows.map(
		({
			blocked,
			createdByName,
			failed,
			passed,
			skipped,
			total,
			untested,
			...run
		}) => ({
			counts: { blocked, failed, passed, skipped, total, untested },
			createdByName,
			run,
		})
	);
}

export async function findTestRun(runId: string): Promise<TestRun | null> {
	const [run] = await db
		.select()
		.from(testRuns)
		.where(eq(testRuns.id, runId))
		.limit(1);
	return run ?? null;
}

export async function countCaseRunReferences(
	tx: DbTransaction,
	caseId: string
): Promise<number> {
	const [row] = await tx
		.select({ value: countDistinct(testRunCases.runId) })
		.from(testRunCases)
		.where(eq(testRunCases.caseId, caseId));
	return row?.value ?? 0;
}
