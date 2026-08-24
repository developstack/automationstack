/**
 * Writes every selection/filter change back into the URL, which is the single
 * source of truth for the workspace (module, case, filters, history panel).
 */
import type {
	CasePriority,
	CaseStatus,
} from "@automationstack/db/schema/test-cases";
import { getRouteApi } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import type {
	WorkspaceSearch,
	WorkspaceSearchReducer,
} from "@/components/workspace/workspace-search";

const routeApi = getRouteApi("/projects/$projectId/");

type SearchPatch = Partial<WorkspaceSearch>;

export interface WorkspaceNavigation {
	clearFilters: () => void;
	closeCase: () => void;
	closeCreate: () => void;
	openCreate: () => void;
	selectCase: (caseId: string) => void;
	setHistory: (open: boolean) => void;
	setKeyword: (keyword: string) => void;
	setPage: (page: number) => void;
	setPriority: (priority: CasePriority[]) => void;
	setStatus: (status: CaseStatus | undefined) => void;
	setTags: (tags: string[]) => void;
}

/** Every filter change also rewinds to page 1, otherwise you land on an empty page. */
const FIRST_PAGE: SearchPatch = { page: undefined };

type ApplyPatch = (next: SearchPatch, replace: boolean) => void;
type ApplyReducer = (reducer: WorkspaceSearchReducer, replace: boolean) => void;

/** 筛选类操作：替换历史项，并一律回到第 1 页。 */
function filterActions(patch: ApplyPatch, reduce: ApplyReducer) {
	return {
		clearFilters: () =>
			patch(
				{
					...FIRST_PAGE,
					kw: undefined,
					priority: undefined,
					status: undefined,
					tags: undefined,
				},
				true
			),
		/**
		 * 关键词是防抖输入，挂载时也会推一次当前值；如果无条件重置页码，
		 * 深链 `?page=2` 会在进入页面 300ms 后被自己改回第 1 页。
		 * 所以值没变就原样返回，不产生导航。
		 */
		setKeyword: (keyword: string) => {
			const kw = keyword === "" ? undefined : keyword;
			reduce(
				(prev) => (prev.kw === kw ? prev : { ...prev, ...FIRST_PAGE, kw }),
				true
			);
		},
		setPriority: (priority: CasePriority[]) =>
			patch(
				{
					...FIRST_PAGE,
					priority: priority.length === 0 ? undefined : priority,
				},
				true
			),
		setStatus: (status: CaseStatus | undefined) =>
			patch({ ...FIRST_PAGE, status }, true),
		setTags: (tags: string[]) =>
			patch(
				{ ...FIRST_PAGE, tags: tags.length === 0 ? undefined : tags },
				true
			),
	};
}

/** 选择类操作：翻页和开关详情要能被浏览器后退撤销，所以推新历史项。 */
function selectionActions(patch: ApplyPatch) {
	return {
		closeCase: () => patch({ caseId: undefined, history: undefined }, false),
		/*
		 * 新建抽屉的开合也推新历史项，与详情抽屉一致：用户按后退退出抽屉是
		 * 学得会的预期，而把它做成 replace 会让后退直接跳出整个列表页。
		 */
		closeCreate: () => patch({ create: undefined, draft: undefined }, false),
		/*
		 * ⚠️ openCreate 必须显式清掉 `draft`：这个按钮的语义就是「建一条全新的」。
		 * 留着上一次「继续编辑」带进 URL 的那份 id，点新建又会把那份草稿恢复出来，
		 * 正是这次要修的老毛病。
		 */
		openCreate: () => patch({ create: true, draft: undefined }, false),
		// 创建成功后要打开的是详情抽屉，顺手收掉新建那一个（连同它的草稿指名）。
		selectCase: (caseId: string) =>
			patch(
				{ caseId, create: undefined, draft: undefined, history: undefined },
				false
			),
		setHistory: (open: boolean) => patch({ history: open || undefined }, false),
		setPage: (page: number) =>
			patch({ page: page <= 1 ? undefined : page }, false),
	};
}

export function useWorkspaceNavigation(): WorkspaceNavigation {
	const navigate = routeApi.useNavigate();

	const reduce = useCallback<ApplyReducer>(
		(reducer, replace) => {
			navigate({ replace, search: reducer });
		},
		[navigate]
	);

	const patch = useCallback<ApplyPatch>(
		(next, replace) => {
			reduce((prev) => ({ ...prev, ...next }), replace);
		},
		[reduce]
	);

	return useMemo(
		() => ({ ...filterActions(patch, reduce), ...selectionActions(patch) }),
		[patch, reduce]
	);
}
