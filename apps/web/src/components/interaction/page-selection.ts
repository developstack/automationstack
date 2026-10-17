/**
 * 分页表格的勾选：勾选的 id 跨页保留，表头勾选框只作用于当前页。
 * 用例管理的表格和测试任务的用例选择器共用。
 */

/** 当前页的勾选情况：全选、部分选中（表头显示半选）或都没有选。 */
export type PageSelectionState = "all" | "some" | "none";

export function pageSelectionState(
	selected: ReadonlySet<string>,
	pageIds: readonly string[]
): PageSelectionState {
	const count = pageIds.filter((id) => selected.has(id)).length;
	if (count === 0) {
		return "none";
	}
	return count === pageIds.length ? "all" : "some";
}

/** 勾选或取消一行。返回新的集合。 */
export function toggleId(
	selected: ReadonlySet<string>,
	id: string
): Set<string> {
	const next = new Set(selected);
	if (next.has(id)) {
		next.delete(id);
	} else {
		next.add(id);
	}
	return next;
}

/** 表头勾选框：当前页已经全选时取消当前页，否则选中当前页。其他页的勾选不变。 */
export function togglePageIds(
	selected: ReadonlySet<string>,
	pageIds: readonly string[]
): Set<string> {
	const next = new Set(selected);
	const allSelected = pageSelectionState(selected, pageIds) === "all";
	for (const id of pageIds) {
		if (allSelected) {
			next.delete(id);
		} else {
			next.add(id);
		}
	}
	return next;
}
