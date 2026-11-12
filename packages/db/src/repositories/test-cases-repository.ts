import { and, asc, count, eq, gt, gte, inArray, ne, sql } from "drizzle-orm";

import { db } from "../index";
import { modules } from "../schema/modules";
import { type TestCase, testCases } from "../schema/test-cases";
import { planCaseRemoval, type SkippedCaseRemoval } from "./case-remove-core";
import type { DbTransaction, RemoveTestCaseResult } from "./repository-types";
import { syncRunCaseModulesInTx } from "./run-case-module";
import {
	countCaseRunReferences,
	countRunReferencesByCase,
} from "./test-runs-repository";

export type ReorderCasesResult =
	| { kind: "invalid-set" }
	| { kind: "ok"; projectId: string };

export type CaseStructureResult =
	| { kind: "invalid-module" }
	| { kind: "not-found" }
	| {
			kind: "ok";
			/** 用例的模块跟着改的测试任务（ADR 0009）。 */
			syncedRunIds: string[];
			testCase: TestCase;
	  };

/**
 * 只改排序时保留更新时间。用例列表按更新时间排序，插入或删除一条用例时，
 * 同一模块中排在后面的用例不应该因为位置变化而排到最前面。
 */
const KEEP_UPDATED_AT = { updatedAt: sql`${testCases.updatedAt}` };

export async function getTestCaseById(id: string): Promise<TestCase | null> {
	const [row] = await db
		.select()
		.from(testCases)
		.where(eq(testCases.id, id))
		.limit(1);
	return row ?? null;
}

export async function getTestCaseInTx(
	tx: DbTransaction,
	id: string
): Promise<TestCase | null> {
	const [row] = await tx
		.select()
		.from(testCases)
		.where(eq(testCases.id, id))
		.limit(1);
	return row ?? null;
}

export async function countCasesInModule(
	tx: DbTransaction,
	moduleId: string,
	excludeId?: string
): Promise<number> {
	const base = eq(testCases.moduleId, moduleId);
	const where = excludeId ? and(base, ne(testCases.id, excludeId)) : base;
	const [row] = await tx
		.select({ value: count() })
		.from(testCases)
		.where(where);
	return row?.value ?? 0;
}

export async function openCaseSlot(
	tx: DbTransaction,
	moduleId: string,
	index: number
): Promise<void> {
	await tx
		.update(testCases)
		.set({ sortOrder: sql`${testCases.sortOrder} + 1`, ...KEEP_UPDATED_AT })
		.where(
			and(eq(testCases.moduleId, moduleId), gte(testCases.sortOrder, index))
		);
}

export async function closeCaseSlot(
	tx: DbTransaction,
	moduleId: string,
	index: number
): Promise<void> {
	await tx
		.update(testCases)
		.set({ sortOrder: sql`${testCases.sortOrder} - 1`, ...KEEP_UPDATED_AT })
		.where(
			and(eq(testCases.moduleId, moduleId), gt(testCases.sortOrder, index))
		);
}

export async function moveTestCaseInTx(
	tx: DbTransaction,
	input: { id: string; index?: number; moduleId: string }
): Promise<CaseStructureResult> {
	const current = await getTestCaseInTx(tx, input.id);
	if (!current) {
		return { kind: "not-found" };
	}
	const [targetModule] = await tx
		.select({ projectId: modules.projectId })
		.from(modules)
		.where(eq(modules.id, input.moduleId))
		.limit(1);
	if (!targetModule || targetModule.projectId !== current.projectId) {
		return { kind: "invalid-module" };
	}
	await closeCaseSlot(tx, current.moduleId, current.sortOrder);
	const total = await countCasesInModule(tx, input.moduleId, current.id);
	const index = Math.min(Math.max(input.index ?? total, 0), total);
	if (index < total) {
		await openCaseSlot(tx, input.moduleId, index);
	}
	const [row] = await tx
		.update(testCases)
		.set({ moduleId: input.moduleId, sortOrder: index })
		.where(eq(testCases.id, current.id))
		.returning();
	if (!row) {
		throw new Error("moveTestCase: update returned no row");
	}
	const syncedRunIds = await syncRunCaseModulesInTx(
		tx,
		[row.id],
		input.moduleId
	);
	return { kind: "ok", syncedRunIds, testCase: row };
}

export async function reorderTestCasesInTx(
	tx: DbTransaction,
	input: { moduleId: string; orderedIds: string[] }
): Promise<ReorderCasesResult> {
	const rows = await tx
		.select({ id: testCases.id, projectId: testCases.projectId })
		.from(testCases)
		.where(eq(testCases.moduleId, input.moduleId));
	const existingIds = new Set(rows.map((row) => row.id));
	const uniqueOrdered = new Set(input.orderedIds);
	const projectId = rows[0]?.projectId;
	const sameSet =
		existingIds.size === uniqueOrdered.size &&
		uniqueOrdered.size === input.orderedIds.length &&
		input.orderedIds.every((id) => existingIds.has(id));
	if (!(sameSet && projectId)) {
		return { kind: "invalid-set" };
	}
	for (const [position, id] of input.orderedIds.entries()) {
		// biome-ignore lint/performance/noAwaitInLoops: 单连接事务内的语句必须顺序执行
		await tx
			.update(testCases)
			.set({ sortOrder: position, ...KEEP_UPDATED_AT })
			.where(eq(testCases.id, id));
	}
	return { kind: "ok", projectId };
}

export async function removeTestCaseInTx(
	tx: DbTransaction,
	id: string
): Promise<RemoveTestCaseResult> {
	const current = await getTestCaseInTx(tx, id);
	if (!current) {
		return { kind: "not-found" };
	}
	const referencedByRunCount = await countCaseRunReferences(tx, id);
	if (referencedByRunCount > 0) {
		return { kind: "blocked", referencedByRunCount };
	}
	await tx.delete(testCases).where(eq(testCases.id, id));
	await closeCaseSlot(tx, current.moduleId, current.sortOrder);
	return { kind: "removed", testCase: current };
}

export interface RemoveTestCasesInput {
	caseIds: readonly string[];
	/** 只删除这个项目中的用例。其他项目的 id 与不存在的 id 一样处理。 */
	projectId: string;
}

export interface RemoveTestCasesResult {
	missingIds: string[];
	removed: TestCase[];
	skipped: SkippedCaseRemoval<TestCase>[];
}

export async function removeTestCasesInTx(
	tx: DbTransaction,
	input: RemoveTestCasesInput
): Promise<RemoveTestCasesResult> {
	// 按 id 的顺序加锁。两个同时进行的批量操作按同一个顺序等待，不会死锁。
	// 加锁后，测试任务不能再加入这些用例，所以下面的引用数在提交前不会变
	const locked = await tx
		.select()
		.from(testCases)
		.where(
			and(
				inArray(testCases.id, [...new Set(input.caseIds)]),
				eq(testCases.projectId, input.projectId)
			)
		)
		.orderBy(asc(testCases.id))
		.for("update");
	const runCounts = await countRunReferencesByCase(
		tx,
		locked.map((testCase) => testCase.id)
	);
	const plan = planCaseRemoval(input.caseIds, locked, runCounts);
	for (const testCase of plan.removable) {
		// biome-ignore lint/performance/noAwaitInLoops: 同一个事务中的写入只能串行
		await tx.delete(testCases).where(eq(testCases.id, testCase.id));
		await closeCaseSlot(tx, testCase.moduleId, testCase.sortOrder);
	}
	return {
		missingIds: plan.missingIds,
		removed: plan.removable,
		skipped: plan.skipped,
	};
}

export function moveTestCase(input: {
	id: string;
	index?: number;
	moduleId: string;
}): Promise<CaseStructureResult> {
	return db.transaction((tx) => moveTestCaseInTx(tx, input));
}

export function reorderTestCases(input: {
	moduleId: string;
	orderedIds: string[];
}): Promise<ReorderCasesResult> {
	return db.transaction((tx) => reorderTestCasesInTx(tx, input));
}

export function removeTestCase(id: string): Promise<RemoveTestCaseResult> {
	return db.transaction((tx) => removeTestCaseInTx(tx, id));
}

/**
 * 批量删除用例，在一个事务中完成。被测试任务用到的用例跳过（只能改为废弃），
 * 不存在的用例当作已经删除，其余的用例删除。版本历史和附件记录随用例一起删除。
 */
export function removeTestCases(
	input: RemoveTestCasesInput
): Promise<RemoveTestCasesResult> {
	return db.transaction((tx) => removeTestCasesInTx(tx, input));
}
