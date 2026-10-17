import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	getTableColumns,
	inArray,
	type SQL,
	sql,
} from "drizzle-orm";

import { db } from "../index";
import {
	type TestRun,
	type TestRunCaseResult,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import { users } from "../schema/users";
import type { DbTransaction } from "./repository-types";
import { settleAutoSubmitForProject } from "./test-run-auto-submit-repository";
import {
	buildTestRunListConditions,
	type ListTestRunsFilter,
} from "./test-run-list-filter-core";

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

function resultCount(result: TestRunCaseResult): SQL<number> {
	return sql<number>`count(${testRunCases.id}) filter (where ${testRunCases.result} = ${result}::test_run_case_result)`.mapWith(
		Number
	);
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
		.where(and(...buildTestRunListConditions({ ...filter, projectId })))
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

/** 每条用例被几个测试任务用到。没有被用到的用例不在结果中。 */
export async function countRunReferencesByCase(
	tx: DbTransaction,
	caseIds: readonly string[]
): Promise<Map<string, number>> {
	if (caseIds.length === 0) {
		return new Map();
	}
	const rows = await tx
		.select({
			caseId: testRunCases.caseId,
			value: countDistinct(testRunCases.runId),
		})
		.from(testRunCases)
		.where(inArray(testRunCases.caseId, [...caseIds]))
		.groupBy(testRunCases.caseId);
	return new Map(rows.map((row) => [row.caseId, row.value]));
}
