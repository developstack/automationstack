import { and, count, eq, gt, gte, ne, sql } from "drizzle-orm";

import { db } from "../index";
import { modules } from "../schema/modules";
import { type TestCase, testCases } from "../schema/test-cases";
import type { DbTransaction, RemoveTestCaseResult } from "./repository-types";
import { countCaseRunReferences } from "./test-runs-repository";

/**
 * 单条用例的读取与**结构性写入**：取一条、移动到别的模块、模块内重排、删除。
 *
 * 「结构性」指的是只动 `moduleId` / `sortOrder` 这类位置字段，以及删除本身；
 * 用例内容字段的增改在 `case-mutations-repository.ts`（那边还要写版本快照）。
 * 列表查询在 `case-list-repository.ts`。
 */

/** 重排成功时回带 projectId，便于调用方发布实时失效事件。 */
export type ReorderCasesResult =
	| { kind: "invalid-set" }
	| { kind: "ok"; projectId: string };

export type CaseStructureResult =
	| { kind: "invalid-module" }
	| { kind: "not-found" }
	| { kind: "ok"; testCase: TestCase };

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
		.set({ sortOrder: sql`${testCases.sortOrder} + 1` })
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
		.set({ sortOrder: sql`${testCases.sortOrder} - 1` })
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
	return { kind: "ok", testCase: row };
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
			.set({ sortOrder: position })
			.where(eq(testCases.id, id));
	}
	return { kind: "ok", projectId };
}

/**
 * 删除一条用例。
 *
 * **返回契约**（三选一，任何分支都不抛异常）：
 * - `{ kind: "removed", testCase }` —— 删成功，回带被删的行，
 *   调用方据此拿到 projectId / moduleId 发实时失效事件
 * - `{ kind: "not-found" }` —— 用例不存在（或已被并发删除）
 * - `{ kind: "blocked", referencedByRunCount }` —— 被 N 个测试任务引用，拒绝删除；
 *   router 应映射成「该用例被 N 个测试任务引用，无法删除；可改为『废弃』状态」
 *
 * 引用检查必须在这里做而不是靠数据库外键报错：`test_run_cases.caseId` 的
 * `onDelete: restrict`（plan §3.4）只能给出一个 23503 违约异常，拿不到引用数量，
 * 也没法在同一事务里安全地区分「被引用」和其它约束冲突。检查与删除同事务，
 * 否则查完到删掉之间别人可以新建测试任务引用它。
 */
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
