/**
 * Sibling-order helpers shared by the module and case cache patches.
 *
 * Both entities keep a dense `sortOrder` per group (modules per parent, cases
 * per module) exactly like the repositories do, so the patched cache matches
 * what the server would return until the next refetch.
 */

export interface OrderedRow {
	id: string;
	sortOrder: number;
}

type InGroup<T> = (row: T) => boolean;

function bySortOrder<T extends OrderedRow>(a: T, b: T): number {
	return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

/**
 * Stable sibling order (`sortOrder`, ties broken by id) as a copy. The canvas
 * adapter and the render-budget planner must walk siblings in exactly the same
 * order, otherwise the budget would expand modules the canvas draws elsewhere.
 */
export function sortByOrder<T extends OrderedRow>(items: readonly T[]): T[] {
	return [...items].sort(bySortOrder);
}

function clampIndex(index: number | undefined, total: number): number {
	return Math.min(Math.max(index ?? total, 0), total);
}

/**
 * Rewrites one sibling group: `entry` (when given) is spliced in at `index`
 * and the whole group is renumbered 0..n-1. Rows outside the group are kept
 * untouched; the returned order is irrelevant because callers rebuild trees.
 */
export function placeInGroup<T extends OrderedRow>(
	rows: readonly T[],
	inGroup: InGroup<T>,
	entry: T | null,
	index?: number
): T[] {
	const outside = rows.filter((row) => !inGroup(row));
	const group = rows.filter(inGroup).sort(bySortOrder);
	if (entry !== null) {
		group.splice(clampIndex(index, group.length), 0, entry);
	}
	return [
		...outside,
		...group.map((row, position) => ({ ...row, sortOrder: position })),
	];
}

/** Removes `ids` and renumbers whatever groups they belonged to. */
export function removeFromGroups<T extends OrderedRow>(
	rows: readonly T[],
	ids: ReadonlySet<string>,
	groupKey: (row: T) => string
): T[] {
	const affected = new Set(rows.filter((row) => ids.has(row.id)).map(groupKey));
	const kept = rows.filter((row) => !ids.has(row.id));
	let result = kept;
	for (const key of affected) {
		result = placeInGroup(result, (row) => groupKey(row) === key, null);
	}
	return result;
}
