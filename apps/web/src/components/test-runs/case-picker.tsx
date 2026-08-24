/**
 * 新建测试任务时的用例选择器：左边模块树，右边筛选 + 可勾选的用例表。
 *
 * 筛选条件全部走组件内 state 而**不写进 URL**——用例列表页那一套把
 * moduleId / kw / page 存在 URL 里是对的（可分享、可后退），但这里是一个
 * 对话框：把它的筛选写进地址栏会污染背后那一页的视图，关掉对话框后
 * 用户会发现自己的列表被莫名其妙地筛过了一遍。
 *
 * 选中集是**跨模块、跨筛选、跨分页累积**的：换模块、改关键词、翻页都不清空。
 * 一个测试任务本来就常常是「A 模块的 P0 + B 模块的冒烟」，中途清空等于逼人
 * 一次只能选一个范围。代价是被筛掉的选中项在表里看不见，所以底部常驻一行
 * 「已选 N 条」并给出清空入口。
 */
import type {
	CasePriority,
	CaseStatus,
} from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { CaseFilters } from "@/components/cases/case-filters";
import {
	caseListInput,
	casePageCount,
} from "@/components/cases/case-list-query";
import { CasePagination } from "@/components/cases/case-pagination";
import { CasePickerModules } from "@/components/test-runs/case-picker-modules";
import {
	PickerTable,
	PickerTableSkeleton,
} from "@/components/test-runs/case-picker-table";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";
import { orpc } from "@/utils/orpc";

/** 对话框内的筛选态。字段名与 `WorkspaceSearch` 对齐，好直接喂给 `caseListInput`。 */
interface PickerFilters {
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
 * 任何筛选条件变化都把页码打回第 1 页。
 * 停在第 3 页改关键词，新结果只有 1 页时会看到一片空白，像是数据没了。
 */
function usePickerFilters() {
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

interface CasePickerProps {
	onChange: (ids: string[]) => void;
	projectId: string;
	selectedIds: string[];
}

export function CasePicker({
	onChange,
	projectId,
	selectedIds,
}: CasePickerProps) {
	const {
		filters,
		setKeyword,
		setModuleId,
		setPage,
		setPriority,
		setStatus,
		setTags,
	} = usePickerFilters();

	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

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

	const casesQuery = useQuery(
		orpc.cases.list.queryOptions({
			input: caseListInput(projectId, search),
			// 翻页/改筛选时留住上一页内容，避免表格塌成 0 高度让对话框整体跳动。
			placeholderData: keepPreviousData,
		})
	);

	const items = casesQuery.data?.items ?? [];

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

	return (
		<div className="flex min-h-0 flex-col gap-3">
			<div className="flex min-h-0 flex-1 gap-3">
				<div className="w-52 shrink-0 overflow-y-auto rounded-md border">
					<CasePickerModules
						onSelect={setModuleId}
						projectId={projectId}
						selectedModuleId={filters.moduleId}
					/>
				</div>
				<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
					<CaseFilters
						keyword={filters.kw}
						onKeywordChange={setKeyword}
						onPriorityChange={setPriority}
						onStatusChange={setStatus}
						onTagsChange={setTags}
						priority={filters.priority}
						projectId={projectId}
						status={filters.status}
						tags={filters.tags}
					/>
					<div className="min-h-0 flex-1 overflow-y-auto">
						{casesQuery.data ? (
							<PickerTable
								cases={items}
								onToggle={toggleOne}
								onTogglePage={togglePage}
								pageAllSelected={pageAllSelected}
								selectedIds={selectedSet}
							/>
						) : (
							<PickerTableSkeleton />
						)}
					</div>
					<CasePagination
						onPageChange={setPage}
						page={filters.page}
						total={casesQuery.data?.total ?? 0}
					/>
				</div>
			</div>
			{/*
			 * 已选条数是**跨筛选**的合计，而屏幕上只看得见当前这一页里被勾中的几条，
			 * 两个数对不上是必然的。aria-live 让读屏在每次勾选后播报合计，
			 * 否则键盘用户完全无从知道自己到底选了多少。
			 */}
			<div className="flex items-center justify-between border-t pt-3">
				<p aria-live="polite" className="text-muted-foreground text-sm">
					已选{" "}
					<span className="font-medium text-foreground tabular-nums">
						{selectedIds.length}
					</span>{" "}
					条用例
					{casesQuery.data
						? `，当前范围共 ${casesQuery.data.total} 条（第 ${filters.page} / ${casePageCount(casesQuery.data.total)} 页）`
						: ""}
				</p>
				<Button
					aria-disabled={selectedIds.length === 0}
					onClick={clearSelection}
					size="sm"
					type="button"
					variant="ghost"
				>
					清空选择
				</Button>
			</div>
		</div>
	);
}
