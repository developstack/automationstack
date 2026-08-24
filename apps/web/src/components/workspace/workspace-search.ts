/**
 * Zod schema for the workspace list-view search params.
 * The URL is the single source of truth for the current selection
 * (module, case, filters, history panel) so deep links, back/forward
 * and tab switches all restore the same state.
 */
import {
	casePrioritySchema,
	caseStatusSchema,
} from "@automationstack/api/schemas/case";
import { z } from "zod";

export const workspaceSearchSchema = z.object({
	/** Opens the case detail sheet for this case id. */
	caseId: z.uuid().optional(),
	/**
	 * 打开「新建用例」抽屉。开合状态放在 URL 而不是列表页的组件 state 里：
	 * 侧栏（含「未完成草稿」入口）挂在父路由的 layout 上，够不到列表页的 state，
	 * 而这个工作区本来就以 URL 为唯一真相来源（见文件头）。它必须与 moduleId
	 * 同时存在才有意义——创建总是落在某个模块下。
	 */
	create: z.boolean().optional(),
	/**
	 * 指名新建抽屉要恢复**哪一份**本地草稿（草稿自己的 caseId）。
	 *
	 * 不带它 = 一张空表单。这是「新建用例」的默认行为，也是这次改动的要点：
	 * 草稿留在本机，但点新建绝不会被它顶掉（用户原话：「我草稿的要先放着，
	 * 建新的反而不行了」）。带上它才恢复，入口只有两个——侧栏的「未完成草稿」
	 * 清单，和抽屉顶部那条提示。
	 *
	 * 只在有 `create` 时才有意义。草稿本身不进 URL，值只是个 id：内容留在
	 * localStorage 里，换台机器打开这个链接只会得到「那份草稿不在这台电脑上」。
	 */
	draft: z.uuid().optional(),
	/** Shows the version history panel inside the detail sheet. */
	history: z.boolean().optional(),
	/** Case name keyword filter (debounced input). */
	kw: z.string().optional(),
	/** Selected module in the left tree; absent = whole project. */
	moduleId: z.uuid().optional(),
	/** 1-based case list page; absent = first page. */
	page: z.number().int().min(1).optional(),
	priority: z.array(casePrioritySchema).optional(),
	status: caseStatusSchema.optional(),
	/** Tag filter (any-of); values come from `cases.listTags`. */
	tags: z.array(z.string()).optional(),
});

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;

/**
 * Stable `search` reducers for <Link>/navigate. They live at module scope so
 * JSX props never receive a freshly created closure (lint/performance/noJsxPropsBind).
 */
export type WorkspaceSearchReducer = (prev: WorkspaceSearch) => WorkspaceSearch;

/** Carries every current param forward unchanged (view switcher tabs). */
export const keepWorkspaceSearch: WorkspaceSearchReducer = (prev) => prev;

/** Closes the case detail sheet and its version-history panel. */
export const clearCaseSelection: WorkspaceSearchReducer = (prev) => ({
	...prev,
	caseId: undefined,
	history: undefined,
});

/**
 * Selects the whole project: no module filter, no open case.
 * Also resets the page — the previous page number rarely exists in the new
 * scope, and landing on an empty page looks like data loss.
 */
export const clearModuleSelection: WorkspaceSearchReducer = (prev) => ({
	...clearCaseSelection(prev),
	// 不选模块就没有创建目标，抽屉开不起来；参数留在 URL 里只会是条死参数。
	create: undefined,
	// 草稿是挂在具体模块下的，模块都不选了，指名恢复哪一份就更无从谈起。
	draft: undefined,
	moduleId: undefined,
	page: undefined,
});

/** Drops every case filter and returns to the first page. */
export const clearCaseFilters: WorkspaceSearchReducer = (prev) => ({
	...prev,
	kw: undefined,
	page: undefined,
	priority: undefined,
	status: undefined,
	tags: undefined,
});

/** Whether any filter is narrowing the case list right now. */
export function hasCaseFilters(search: WorkspaceSearch): boolean {
	return (
		(search.kw ?? "") !== "" ||
		search.status !== undefined ||
		(search.priority?.length ?? 0) > 0 ||
		(search.tags?.length ?? 0) > 0
	);
}

/**
 * 「继续编辑某一份草稿」这次导航：选中它所属的模块 + 打开新建抽屉 + 指名是哪一份。
 *
 * 与模块树的选模块链接同一套写法（module-node-links.tsx）：换模块要清掉详情
 * 选中与页码。抽出来放在这里，是因为两个入口要走同一条路——侧栏的草稿清单
 * （case-drafts-dialog.tsx）和抽屉顶部的提示（cases/case-draft-picker.tsx）。
 * 两边各写一份，迟早会有一边忘了清 page 或忘了带 draft。
 *
 * 返回的是 reducer 而不是直接改 search：调用方要把它塞进 `<Link search={...}>`，
 * 而 JSX 属性不能收每次渲染都新建的闭包（lint/performance/noJsxPropsBind），
 * 所以调用方还要再用 useMemo/useCallback 稳住引用。
 */
export function resumeDraftSearch(
	moduleId: string,
	draftId: string
): WorkspaceSearchReducer {
	return (prev) => ({
		...clearCaseSelection(prev),
		create: true,
		draft: draftId,
		moduleId,
		page: undefined,
	});
}
