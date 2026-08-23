import {
	and,
	asc,
	count,
	eq,
	gt,
	gte,
	ilike,
	inArray,
	ne,
	type SQL,
	sql,
} from "drizzle-orm";

import { db } from "../index";
import { modules } from "../schema/modules";
import {
	type CasePriority,
	type CaseStatus,
	type TestCase,
	testCases,
} from "../schema/test-cases";
import { getModuleSubtreeIds } from "./module-subtree";
import type { DbTransaction } from "./repository-types";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface ListTestCasesFilter {
	includeDescendants?: boolean;
	keyword?: string;
	moduleId?: string;
	page?: number;
	pageSize?: number;
	priority?: CasePriority[];
	projectId: string;
	status?: CaseStatus;
	/** 标签筛选，any-of 语义：命中任意一个即匹配；空数组视同不筛选。 */
	tags?: string[];
}

export interface ListTestCasesResult {
	items: TestCase[];
	page: number;
	pageSize: number;
	total: number;
}

/** 重排成功时回带 projectId，便于调用方发布实时失效事件。 */
export type ReorderCasesResult =
	| { kind: "invalid-set" }
	| { kind: "ok"; projectId: string };

export type CaseStructureResult =
	| { kind: "invalid-module" }
	| { kind: "not-found" }
	| { kind: "ok"; testCase: TestCase };

async function buildModuleCondition(
	filter: ListTestCasesFilter
): Promise<SQL | undefined> {
	if (!filter.moduleId) {
		return undefined;
	}
	if (filter.includeDescendants) {
		const ids = await getModuleSubtreeIds(db, filter.moduleId);
		return inArray(testCases.moduleId, ids);
	}
	return eq(testCases.moduleId, filter.moduleId);
}

/**
 * 标签筛选条件。
 *
 * 语义定为 **any-of**（命中任意一个标签即匹配），与优先级筛选的多选
 * 语义保持一致：用户勾选多个标签是「扩大」结果集而非「收窄」。
 * 若将来需要 all-of，应新增独立参数而不是改变本参数语义。
 *
 * SQL 用 jsonb 的 `?|`（存在任意一个 key/元素）配合单个 text[] 绑定参数：
 * `tags` 存的是 string[]，`?|` 对 jsonb 数组按元素比较。
 * 注意不能直接把 JS 数组插进 sql 模板（drizzle 会展开成 `($1, $2)`
 * 的列表），必须用 sql.param 打成单个参数再 ::text[]。
 */
function buildTagsCondition(tags: string[]): SQL {
	return sql`${testCases.tags} ?| ${sql.param(tags)}::text[]`;
}

async function buildListConditions(
	filter: ListTestCasesFilter
): Promise<SQL[]> {
	const conditions: SQL[] = [eq(testCases.projectId, filter.projectId)];
	const moduleCondition = await buildModuleCondition(filter);
	if (moduleCondition) {
		conditions.push(moduleCondition);
	}
	if (filter.status) {
		conditions.push(eq(testCases.status, filter.status));
	}
	if (filter.priority && filter.priority.length > 0) {
		conditions.push(inArray(testCases.priority, filter.priority));
	}
	if (filter.tags && filter.tags.length > 0) {
		conditions.push(buildTagsCondition(filter.tags));
	}
	if (filter.keyword) {
		const escaped = filter.keyword.replace(/[%_\\]/g, "\\$&");
		conditions.push(ilike(testCases.name, `%${escaped}%`));
	}
	return conditions;
}

export async function listTestCases(
	filter: ListTestCasesFilter
): Promise<ListTestCasesResult> {
	const conditions = await buildListConditions(filter);
	const where = and(...conditions);
	const page = Math.max(filter.page ?? 1, 1);
	const pageSize = Math.min(
		Math.max(filter.pageSize ?? DEFAULT_PAGE_SIZE, 1),
		MAX_PAGE_SIZE
	);
	const [countRow] = await db
		.select({ value: count() })
		.from(testCases)
		.where(where);
	const items = await db
		.select()
		.from(testCases)
		.where(where)
		.orderBy(asc(testCases.moduleId), asc(testCases.sortOrder))
		.limit(pageSize)
		.offset((page - 1) * pageSize);
	return { items, page, pageSize, total: countRow?.value ?? 0 };
}

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

/** 返回被删除的用例行（调用方据此拿到 projectId / moduleId），不存在时 null。 */
export async function removeTestCaseInTx(
	tx: DbTransaction,
	id: string
): Promise<TestCase | null> {
	const current = await getTestCaseInTx(tx, id);
	if (!current) {
		return null;
	}
	await tx.delete(testCases).where(eq(testCases.id, id));
	await closeCaseSlot(tx, current.moduleId, current.sortOrder);
	return current;
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

export function removeTestCase(id: string): Promise<TestCase | null> {
	return db.transaction((tx) => removeTestCaseInTx(tx, id));
}
