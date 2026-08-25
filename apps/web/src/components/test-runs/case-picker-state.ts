/**
 * 用例选择器的状态层：筛选态、拉列表、维护选中集
 * （从 `case-picker.tsx` 拆出来，见 eslint 的 50 行函数上限）。
 *
 * 三段逻辑抽成 **hook** 而不是跟着 JSX 一起搬进新的子组件：`useState` /
 * `useQuery` 一旦挪进子组件，状态的实例身份就跟着那个子组件的挂载卸载走，
 * 而选择器的选中集本来就是要跨模块、跨筛选、跨分页活下来的。留在 hook 里，
 * 持有它们的仍然是 `CasePicker` 这一个实例，调用点与调用顺序也和拆分前逐行一致。
 */
import type {
	CasePriority,
	CaseStatus,
	TestCase,
} from "@automationstack/db/schema/test-cases";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { caseListInput } from "@/components/cases/case-list-query";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";
import { orpc } from "@/utils/orpc";

/** 对话框内的筛选态。字段名与 `WorkspaceSearch` 对齐，好直接喂给 `caseListInput`。 */
export interface PickerFilters {
	kw: string;
	moduleId: string | undefined;
	page: number;
	priority: CasePriority[];
	status: CaseStatus | undefined;
	tags: string[];
}

const INITIAL_FILTERS: PickerFilters = {
	kw: "",
	moduleId: undefined,
	page: 1,
	priority: [],
	status: undefined,
	tags: [],
};

/**
 * 筛选态连同它的六个 setter 一起当一个整体传给右栏。拆成六个独立的 prop 只是
 * 把同一份状态在调用点摊开抄一遍，改一个筛选字段要同时动三处签名。
 */
export interface PickerFilterState {
	filters: PickerFilters;
	setKeyword: (kw: string) => void;
	setModuleId: (moduleId: string | undefined) => void;
	setPage: (page: number) => void;
	setPriority: (priority: CasePriority[]) => void;
	setStatus: (status: CaseStatus | undefined) => void;
	setTags: (tags: string[]) => void;
}

/**
 * 任何筛选条件变化都把页码打回第 1 页。
 * 停在第 3 页改关键词，新结果只有 1 页时会看到一片空白，像是数据没了。
 */
export function usePickerFilters(): PickerFilterState {
	const [filters, setFilters] = useState<PickerFilters>(INITIAL_FILTERS);

	const setModuleId = useCallback((moduleId: string | undefined) => {
		setFilters((prev) => ({ ...prev, moduleId, page: 1 }));
	}, []);
	const setKeyword = useCallback((kw: string) => {
		setFilters((prev) => (prev.kw === kw ? prev : { ...prev, kw, page: 1 }));
	}, []);
	const setStatus = useCallback((status: CaseStatus | undefined) => {
		setFilters((prev) => ({ ...prev, page: 1, status }));
	}, []);
	const setPriority = useCallback((priority: CasePriority[]) => {
		setFilters((prev) => ({ ...prev, page: 1, priority }));
	}, []);
	const setTags = useCallback((tags: string[]) => {
		setFilters((prev) => ({ ...prev, page: 1, tags }));
	}, []);
	const setPage = useCallback((page: number) => {
		setFilters((prev) => ({ ...prev, page }));
	}, []);

	return {
		filters,
		setKeyword,
		setModuleId,
		setPage,
		setPriority,
		setStatus,
		setTags,
	};
}

/** 按当前筛选拉这一页用例。返回整个 query 而不是只返回 items：调用方还要用
 * `data` 分「首屏骨架 / 有数据」，也要用 `total` 画分页与合计。 */
export function useCasePickerCases(projectId: string, filters: PickerFilters) {
	/*
	 * `caseListInput` 要的是 WorkspaceSearch。这里拼一个等价对象而不是各写一套
	 * 输入：列表页和选择器命中同一个 query key，用户刚在列表页看过的那一页
	 * 在这里是缓存命中，对话框一开就有内容。
	 */
	const search: WorkspaceSearch = useMemo(
		() => ({
			kw: filters.kw,
			moduleId: filters.moduleId,
			page: filters.page,
			priority: filters.priority,
			status: filters.status,
			tags: filters.tags,
		}),
		[filters]
	);

	return useQuery(
		orpc.cases.list.queryOptions({
			input: caseListInput(projectId, search),
			// 翻页/改筛选时留住上一页内容，避免表格塌成 0 高度让对话框整体跳动。
			placeholderData: keepPreviousData,
		})
	);
}

interface CasePickerSelectionInput {
	items: TestCase[];
	onChange: (ids: string[]) => void;
	selectedIds: string[];
	selectedSet: ReadonlySet<string>;
}

export interface CasePickerSelection {
	clearSelection: () => void;
	pageAllSelected: boolean;
	toggleOne: (caseId: string) => void;
	togglePage: () => void;
}

/**
 * 选中集本身仍然由外部（`CasePicker` 的调用方）持有，这里只产出改动它的动作：
 * 「追加用例」抽屉和「新建测试任务」抽屉各自要在关闭前读到勾了些什么，
 * 状态收进选择器内部就读不到了。
 *
 * `selectedSet` 由调用方算好传进来而不是在这里 `useMemo`：它在原组件里的位置
 * 早于列表查询，而这个 hook 依赖列表结果，搬进来会改掉 hook 的调用顺序。
 */
export function useCasePickerSelection({
	items,
	onChange,
	selectedIds,
	selectedSet,
}: CasePickerSelectionInput): CasePickerSelection {
	const toggleOne = useCallback(
		(caseId: string) => {
			const next = new Set(selectedIds);
			if (next.has(caseId)) {
				next.delete(caseId);
			} else {
				next.add(caseId);
			}
			onChange([...next]);
		},
		[onChange, selectedIds]
	);

	const pageAllSelected =
		items.length > 0 && items.every((item) => selectedSet.has(item.id));

	const togglePage = useCallback(() => {
		const next = new Set(selectedIds);
		const allSelected =
			items.length > 0 && items.every((item) => next.has(item.id));
		for (const item of items) {
			if (allSelected) {
				next.delete(item.id);
			} else {
				next.add(item.id);
			}
		}
		onChange([...next]);
	}, [items, onChange, selectedIds]);

	// aria-disabled 不会真的挡住点击（仓库统一不用原生 disabled，见
	// case-pagination.tsx 的注释），拦截放在这里 early-return。
	const clearSelection = useCallback(() => {
		if (selectedIds.length === 0) {
			return;
		}
		onChange([]);
	}, [onChange, selectedIds.length]);

	return { clearSelection, pageAllSelected, toggleOne, togglePage };
}
