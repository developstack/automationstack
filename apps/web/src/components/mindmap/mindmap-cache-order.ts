export interface OrderedRow {
	id: string;
	sortOrder: number;
}

type InGroup<T> = (row: T) => boolean;

function bySortOrder<T extends OrderedRow>(a: T, b: T): number {
	return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

export function sortByOrder<T extends OrderedRow>(items: readonly T[]): T[] {
	return [...items].sort(bySortOrder);
}

function clampIndex(index: number | undefined, total: number): number {
	return Math.min(Math.max(index ?? total, 0), total);
}

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
