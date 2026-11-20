import { and, count, eq, gt, gte, isNull, ne, sql } from "drizzle-orm";

import { modules } from "../schema/modules";
import type { DbTransaction } from "./repository-types";

/** 同一个上级模块下的模块。sort_order 是模块在这一组中的位置。 */
export interface SiblingGroup {
	parentId: string | null;
	projectId: string;
}

export function siblingWhere(group: SiblingGroup) {
	const parentCondition =
		group.parentId === null
			? isNull(modules.parentId)
			: eq(modules.parentId, group.parentId);
	return and(eq(modules.projectId, group.projectId), parentCondition);
}

export async function countSiblings(
	tx: DbTransaction,
	group: SiblingGroup,
	excludeId?: string
): Promise<number> {
	const base = siblingWhere(group);
	const where = excludeId ? and(base, ne(modules.id, excludeId)) : base;
	const [row] = await tx.select({ value: count() }).from(modules).where(where);
	return row?.value ?? 0;
}

export async function openSlot(
	tx: DbTransaction,
	group: SiblingGroup,
	index: number
): Promise<void> {
	await tx
		.update(modules)
		.set({ sortOrder: sql`${modules.sortOrder} + 1` })
		.where(and(siblingWhere(group), gte(modules.sortOrder, index)));
}

export async function closeSlot(
	tx: DbTransaction,
	group: SiblingGroup,
	index: number
): Promise<void> {
	await tx
		.update(modules)
		.set({ sortOrder: sql`${modules.sortOrder} - 1` })
		.where(and(siblingWhere(group), gt(modules.sortOrder, index)));
}

export function clampIndex(index: number | undefined, total: number): number {
	return Math.min(Math.max(index ?? total, 0), total);
}
