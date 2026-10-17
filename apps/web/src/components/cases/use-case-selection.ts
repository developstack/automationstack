import { useCallback, useState } from "react";

import {
	type CaseListFilter,
	caseListFilter,
} from "@/components/cases/case-list-query";
import {
	toggleId,
	togglePageIds,
} from "@/components/interaction/page-selection";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";

/**
 * 用例表格中勾选的用例。勾选的 id 跨页保留。
 * 当前页全选后可以选择全部符合筛选的用例（allMatching）：批量操作发送筛选条件，由服务端找出用例。
 */
export interface CaseSelection {
	/** 选择了全部符合筛选的用例，包括其他页上的用例。 */
	allMatching: boolean;
	/** 清空勾选，也取消「选择全部」。 */
	clear: () => void;
	ids: ReadonlySet<string>;
	selectAllMatching: () => void;
	/**
	 * 勾选或取消一行。选择了全部时所有行都显示为勾选，所以这时是取消这一行：
	 * 不再是全部，只保留原来明确勾选的其他用例。
	 */
	toggle: (caseId: string) => void;
	/** 表头勾选框：选中或取消当前页的用例。选择了全部时是取消当前页，规则与 toggle 相同。 */
	togglePage: (pageIds: readonly string[]) => void;
}

/** 批量操作作用的用例：勾选的用例，或全部符合筛选的用例。与请求中的字段相同。 */
export type CaseBatchTarget = { ids: string[] } | { filter: CaseListFilter };

export function caseBatchTarget(
	selection: Pick<CaseSelection, "allMatching" | "ids">,
	filter: CaseListFilter
): CaseBatchTarget {
	return selection.allMatching ? { filter } : { ids: [...selection.ids] };
}

const NO_IDS: ReadonlySet<string> = new Set();

function withoutIds(
	selected: ReadonlySet<string>,
	removed: readonly string[]
): Set<string> {
	const next = new Set(selected);
	for (const id of removed) {
		next.delete(id);
	}
	return next;
}

/**
 * 勾选的有效范围：项目、模块和筛选条件。翻页和打开用例详情不改变范围。
 * 与列表查询使用同一个规范化，所以空关键字和没有关键字是同一个范围。
 */
export function caseSelectionScope(
	projectId: string,
	search: WorkspaceSearch
): string {
	return JSON.stringify(caseListFilter(projectId, search));
}

interface ScopedSelection {
	allMatching: boolean;
	ids: ReadonlySet<string>;
	scope: string;
}

const emptySelection = (scope: string): ScopedSelection => ({
	allMatching: false,
	ids: NO_IDS,
	scope,
});

/** 用例表格的勾选。范围（见 caseSelectionScope）变化时清空，也取消「选择全部」。 */
export function useCaseSelection(scope: string): CaseSelection {
	const [state, setState] = useState<ScopedSelection>(() =>
		emptySelection(scope)
	);
	// 范围变化时在渲染中重置，不等 effect：新的筛选结果第一次显示时就没有旧的勾选
	if (state.scope !== scope) {
		setState(emptySelection(scope));
	}
	const current = state.scope === scope ? state : emptySelection(scope);

	const toggle = useCallback((caseId: string) => {
		setState((prev) => ({
			...prev,
			allMatching: false,
			ids: prev.allMatching
				? withoutIds(prev.ids, [caseId])
				: toggleId(prev.ids, caseId),
		}));
	}, []);
	const togglePage = useCallback((pageIds: readonly string[]) => {
		setState((prev) => ({
			...prev,
			allMatching: false,
			ids: prev.allMatching
				? withoutIds(prev.ids, pageIds)
				: togglePageIds(prev.ids, pageIds),
		}));
	}, []);
	const selectAllMatching = useCallback(() => {
		setState((prev) => ({ ...prev, allMatching: true }));
	}, []);
	const clear = useCallback(() => {
		setState((prev) =>
			prev.ids.size === 0 && !prev.allMatching
				? prev
				: emptySelection(prev.scope)
		);
	}, []);

	return {
		allMatching: current.allMatching,
		clear,
		ids: current.ids,
		selectAllMatching,
		toggle,
		togglePage,
	};
}
