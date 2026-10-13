import { useState } from "react";

const NO_ROWS: ReadonlySet<string> = new Set();

/**
 * 新结果中哪些行是新出现的。previous 为 null 表示列表第一次显示：
 * 这时页面整体有进入动效，行不再单独淡入。
 */
export function enteringRowIds(
	previous: readonly string[] | null,
	next: readonly string[]
): ReadonlySet<string> {
	if (previous === null) {
		return NO_ROWS;
	}
	const kept = new Set(previous);
	return new Set(next.filter((id) => !kept.has(id)));
}

interface TrackedRows {
	entering: ReadonlySet<string>;
	ids: readonly string[];
	key: string;
}

/**
 * 只在行的集合变化时重新计算。实时协作等原因引起的重新渲染不改变结果，
 * 所以正在淡入的行不会中途失去动效。
 */
export function useEnteringRowIds(ids: readonly string[]): ReadonlySet<string> {
	const key = ids.join("\n");
	const [tracked, setTracked] = useState<TrackedRows>(() => ({
		entering: enteringRowIds(null, ids),
		ids,
		key,
	}));
	if (tracked.key !== key) {
		const next = { entering: enteringRowIds(tracked.ids, ids), ids, key };
		setTracked(next);
		return next.entering;
	}
	return tracked.entering;
}
