import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../index";
import { testCases } from "../schema/test-cases";
import {
	type TestRunStatus,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";

/**
 * 用例移动时，模块跟着改的测试任务状态（ADR 0009）：待评审、待测试和测试中。
 * 已完成、已提交和已作废的测试任务保留用例原来的模块。
 */
export const MODULE_FOLLOWING_RUN_STATUSES = [
	"pending_review",
	"ready",
	"in_progress",
] as const satisfies readonly TestRunStatus[];

/** 测试任务中的用例所属的模块：记录的模块；记录的模块已删除时，用例当前的模块。 */
export const runCaseModuleId = sql<string>`coalesce(${testRunCases.moduleId}, ${testCases.moduleId})`;

/** 用例现在的模块，按用例 id。加入测试任务时用它记录用例的模块。 */
export async function caseModuleIdsInTx(
	tx: DbTransaction,
	caseIds: readonly string[]
): Promise<Map<string, string>> {
	if (caseIds.length === 0) {
		return new Map();
	}
	const rows = await tx
		.select({ id: testCases.id, moduleId: testCases.moduleId })
		.from(testCases)
		.where(inArray(testCases.id, [...caseIds]));
	return new Map(rows.map((row) => [row.id, row.moduleId]));
}

const moduleFollowingRunIds = (tx: DbTransaction) =>
	tx
		.select({ id: testRuns.id })
		.from(testRuns)
		.where(inArray(testRuns.status, [...MODULE_FOLLOWING_RUN_STATUSES]));

/**
 * 把模块跟着改的测试任务中这些用例的模块改为 moduleId。
 * 返回有修改的测试任务，用于通知其他人刷新这些测试任务。
 */
export async function syncRunCaseModulesInTx(
	tx: DbTransaction,
	caseIds: readonly string[],
	moduleId: string
): Promise<string[]> {
	if (caseIds.length === 0) {
		return [];
	}
	const rows = await tx
		.update(testRunCases)
		.set({ moduleId })
		.where(
			and(
				inArray(testRunCases.caseId, [...caseIds]),
				inArray(testRunCases.runId, moduleFollowingRunIds(tx)),
				sql`${testRunCases.moduleId} is distinct from ${moduleId}`
			)
		)
		.returning({ runId: testRunCases.runId });
	return [...new Set(rows.map((row) => row.runId))];
}

export interface ModuleFollowingRun {
	id: string;
	name: string;
	status: TestRunStatus;
}

/**
 * 把这些用例移到 moduleId 时，模块会跟着改的测试任务，按名称排序。
 * 用例在这个测试任务中已经属于 moduleId 时，这个测试任务不改，不列出。
 */
export async function listModuleFollowingRuns(
	caseIds: readonly string[],
	moduleId: string
): Promise<ModuleFollowingRun[]> {
	if (caseIds.length === 0) {
		return [];
	}
	return await db
		.selectDistinct({
			id: testRuns.id,
			name: testRuns.name,
			status: testRuns.status,
		})
		.from(testRunCases)
		.innerJoin(testRuns, eq(testRuns.id, testRunCases.runId))
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.where(
			and(
				inArray(testRunCases.caseId, [...caseIds]),
				inArray(testRuns.status, [...MODULE_FOLLOWING_RUN_STATUSES]),
				sql`${runCaseModuleId} <> ${moduleId}`
			)
		)
		.orderBy(testRuns.name);
}
