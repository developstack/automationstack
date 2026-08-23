import { and, asc, count, eq, gt, gte, isNull, ne, sql } from "drizzle-orm";

import { db } from "../index";
import { type Module, modules } from "../schema/modules";
import { getModuleSubtreeIds } from "./module-subtree";
import type { DbTransaction } from "./repository-types";

export interface CreateModuleInput {
	index?: number;
	name: string;
	parentId: string | null;
	projectId: string;
}

export interface MoveModuleInput {
	id: string;
	index?: number;
	parentId: string | null;
}

export interface ReorderModulesInput {
	orderedIds: string[];
	parentId: string | null;
	projectId: string;
}

export type ModuleMutationResult =
	| { kind: "cycle" }
	| { kind: "invalid-parent" }
	| { kind: "not-found" }
	| { kind: "ok"; module: Module };

export type ReorderResult = { kind: "invalid-set" } | { kind: "ok" };

interface SiblingGroup {
	parentId: string | null;
	projectId: string;
}

function siblingWhere(group: SiblingGroup) {
	const parentCondition =
		group.parentId === null
			? isNull(modules.parentId)
			: eq(modules.parentId, group.parentId);
	return and(eq(modules.projectId, group.projectId), parentCondition);
}

async function getModuleInTx(
	tx: DbTransaction,
	id: string
): Promise<Module | null> {
	const [row] = await tx
		.select()
		.from(modules)
		.where(eq(modules.id, id))
		.limit(1);
	return row ?? null;
}

async function countSiblings(
	tx: DbTransaction,
	group: SiblingGroup,
	excludeId?: string
): Promise<number> {
	const base = siblingWhere(group);
	const where = excludeId ? and(base, ne(modules.id, excludeId)) : base;
	const [row] = await tx.select({ value: count() }).from(modules).where(where);
	return row?.value ?? 0;
}

async function openSlot(
	tx: DbTransaction,
	group: SiblingGroup,
	index: number
): Promise<void> {
	await tx
		.update(modules)
		.set({ sortOrder: sql`${modules.sortOrder} + 1` })
		.where(and(siblingWhere(group), gte(modules.sortOrder, index)));
}

async function closeSlot(
	tx: DbTransaction,
	group: SiblingGroup,
	index: number
): Promise<void> {
	await tx
		.update(modules)
		.set({ sortOrder: sql`${modules.sortOrder} - 1` })
		.where(and(siblingWhere(group), gt(modules.sortOrder, index)));
}

function clampIndex(index: number | undefined, total: number): number {
	return Math.min(Math.max(index ?? total, 0), total);
}

export function listModulesByProject(projectId: string): Promise<Module[]> {
	return db
		.select()
		.from(modules)
		.where(eq(modules.projectId, projectId))
		.orderBy(asc(modules.sortOrder), asc(modules.createdAt));
}

export async function createModuleInTx(
	tx: DbTransaction,
	input: CreateModuleInput
): Promise<ModuleMutationResult> {
	if (input.parentId !== null) {
		const parent = await getModuleInTx(tx, input.parentId);
		if (!parent || parent.projectId !== input.projectId) {
			return { kind: "invalid-parent" };
		}
	}
	const group: SiblingGroup = {
		parentId: input.parentId,
		projectId: input.projectId,
	};
	const total = await countSiblings(tx, group);
	const index = clampIndex(input.index, total);
	if (index < total) {
		await openSlot(tx, group, index);
	}
	const [row] = await tx
		.insert(modules)
		.values({
			name: input.name,
			parentId: input.parentId,
			projectId: input.projectId,
			sortOrder: index,
		})
		.returning();
	if (!row) {
		throw new Error("createModule: insert returned no row");
	}
	return { kind: "ok", module: row };
}

export async function renameModuleInTx(
	tx: DbTransaction,
	id: string,
	name: string
): Promise<ModuleMutationResult> {
	const [row] = await tx
		.update(modules)
		.set({ name })
		.where(eq(modules.id, id))
		.returning();
	return row ? { kind: "ok", module: row } : { kind: "not-found" };
}

async function validateMoveTarget(
	tx: DbTransaction,
	current: Module,
	parentId: string | null
): Promise<Exclude<
	ModuleMutationResult,
	{ kind: "ok"; module: Module }
> | null> {
	if (parentId === null) {
		return null;
	}
	if (parentId === current.id) {
		return { kind: "cycle" };
	}
	const parent = await getModuleInTx(tx, parentId);
	if (!parent || parent.projectId !== current.projectId) {
		return { kind: "invalid-parent" };
	}
	const subtreeIds = await getModuleSubtreeIds(tx, current.id);
	if (subtreeIds.includes(parentId)) {
		return { kind: "cycle" };
	}
	return null;
}

export async function moveModuleInTx(
	tx: DbTransaction,
	input: MoveModuleInput
): Promise<ModuleMutationResult> {
	const current = await getModuleInTx(tx, input.id);
	if (!current) {
		return { kind: "not-found" };
	}
	const targetError = await validateMoveTarget(tx, current, input.parentId);
	if (targetError) {
		return targetError;
	}
	const oldGroup: SiblingGroup = {
		parentId: current.parentId,
		projectId: current.projectId,
	};
	const newGroup: SiblingGroup = {
		parentId: input.parentId,
		projectId: current.projectId,
	};
	await closeSlot(tx, oldGroup, current.sortOrder);
	const total = await countSiblings(tx, newGroup, current.id);
	const index = clampIndex(input.index, total);
	if (index < total) {
		await openSlot(tx, newGroup, index);
	}
	const [row] = await tx
		.update(modules)
		.set({ parentId: input.parentId, sortOrder: index })
		.where(eq(modules.id, current.id))
		.returning();
	if (!row) {
		throw new Error("moveModule: update returned no row");
	}
	return { kind: "ok", module: row };
}

export async function reorderModulesInTx(
	tx: DbTransaction,
	input: ReorderModulesInput
): Promise<ReorderResult> {
	const group: SiblingGroup = {
		parentId: input.parentId,
		projectId: input.projectId,
	};
	const rows = await tx
		.select({ id: modules.id })
		.from(modules)
		.where(siblingWhere(group));
	const existingIds = new Set(rows.map((row) => row.id));
	const uniqueOrdered = new Set(input.orderedIds);
	const sameSet =
		existingIds.size === uniqueOrdered.size &&
		uniqueOrdered.size === input.orderedIds.length &&
		input.orderedIds.every((id) => existingIds.has(id));
	if (!sameSet) {
		return { kind: "invalid-set" };
	}
	for (const [position, id] of input.orderedIds.entries()) {
		// biome-ignore lint/performance/noAwaitInLoops: 单连接事务内的语句必须顺序执行
		await tx
			.update(modules)
			.set({ sortOrder: position })
			.where(eq(modules.id, id));
	}
	return { kind: "ok" };
}

/** 返回被删除的模块行（调用方据此拿到 projectId），不存在时返回 null。 */
export async function removeModuleInTx(
	tx: DbTransaction,
	id: string
): Promise<Module | null> {
	const current = await getModuleInTx(tx, id);
	if (!current) {
		return null;
	}
	await tx.delete(modules).where(eq(modules.id, id));
	await closeSlot(
		tx,
		{ parentId: current.parentId, projectId: current.projectId },
		current.sortOrder
	);
	return current;
}

export function createModule(
	input: CreateModuleInput
): Promise<ModuleMutationResult> {
	return db.transaction((tx) => createModuleInTx(tx, input));
}

export function renameModule(
	id: string,
	name: string
): Promise<ModuleMutationResult> {
	return db.transaction((tx) => renameModuleInTx(tx, id, name));
}

export function moveModule(
	input: MoveModuleInput
): Promise<ModuleMutationResult> {
	return db.transaction((tx) => moveModuleInTx(tx, input));
}

export function reorderModules(
	input: ReorderModulesInput
): Promise<ReorderResult> {
	return db.transaction((tx) => reorderModulesInTx(tx, input));
}

export function removeModule(id: string): Promise<Module | null> {
	return db.transaction((tx) => removeModuleInTx(tx, id));
}
