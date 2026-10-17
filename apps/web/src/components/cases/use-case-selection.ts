import { useCallback, useState } from "react";

import { caseListInput } from "@/components/cases/case-list-query";
import {
	toggleId,
	togglePageIds,
} from "@/components/interaction/page-selection";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";

/** 用例表格中勾选的用例。勾选的 id 跨页保留。 */
export interface CaseSelection {
	clear: () => void;
	ids: ReadonlySet<string>;
	toggle: (caseId: string) => void;
	/** 表头勾选框：选中或取消当前页的用例。 */
	togglePage: (pageIds: readonly string[]) => void;
}

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * 勾选的有效范围：项目、模块和筛选条件。翻页和打开用例详情不改变范围。
 * 与列表查询使用同一个规范化，所以空关键字和没有关键字是同一个范围。
 */
export function caseSelectionScope(
	projectId: string,
	search: WorkspaceSearch
): string {
	const { page: _page, ...scope } = caseListInput(projectId, search);
	return JSON.stringify(scope);
}

interface ScopedIds {
	ids: ReadonlySet<string>;
	scope: string;
}

/** 用例表格的勾选。范围（见 caseSelectionScope）变化时清空。 */
export function useCaseSelection(scope: string): CaseSelection {
	const [state, setState] = useState<ScopedIds>({ ids: NO_IDS, scope });
	// 范围变化时在渲染中重置，不等 effect：新的筛选结果第一次显示时就没有旧的勾选
	if (state.scope !== scope) {
		setState({ ids: NO_IDS, scope });
	}
	const ids = state.scope === scope ? state.ids : NO_IDS;

	const toggle = useCallback((caseId: string) => {
		setState((prev) => ({ ...prev, ids: toggleId(prev.ids, caseId) }));
	}, []);
	const togglePage = useCallback((pageIds: readonly string[]) => {
		setState((prev) => ({ ...prev, ids: togglePageIds(prev.ids, pageIds) }));
	}, []);
	const clear = useCallback(() => {
		setState((prev) => (prev.ids.size === 0 ? prev : { ...prev, ids: NO_IDS }));
	}, []);

	return { clear, ids, toggle, togglePage };
}
