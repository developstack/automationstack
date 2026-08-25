/**
 * 用例选择器的右栏：筛选条 + 用例表 + 分页
 * （从 `case-picker.tsx` 拆出来，见 eslint 的 50 行函数上限）。
 *
 * 定义在**模块顶层**，不是写成 `CasePicker` 内部的一个函数：内部定义的组件
 * 每次父组件重渲染都是一个新的类型，React 认不出是同一个东西，会把整棵子树
 * 卸载重建。筛选条里的关键词输入框是受控的，那样每敲一个字都要丢一次焦点，
 * 而选择器恰恰是靠边打字边看结果用的。
 */
import type { TestCase } from "@automationstack/db/schema/test-cases";

import { CaseFilters } from "@/components/cases/case-filters";
import { CasePagination } from "@/components/cases/case-pagination";
import type {
	CasePickerSelection,
	PickerFilterState,
} from "@/components/test-runs/case-picker-state";
import {
	PickerTable,
	PickerTableSkeleton,
} from "@/components/test-runs/case-picker-table";

interface CasePickerResultsProps {
	cases: TestCase[];
	filterState: PickerFilterState;
	/** 首屏（还没有任何一页数据）时画骨架而不是空表：空表在这里是个结论，
	 * 「当前范围下没有用例」，加载中说这句话是在撒谎。 */
	hasData: boolean;
	projectId: string;
	selectedIds: ReadonlySet<string>;
	selection: CasePickerSelection;
	total: number;
}

export function CasePickerResults({
	cases,
	filterState,
	hasData,
	projectId,
	selectedIds,
	selection,
	total,
}: CasePickerResultsProps) {
	const { filters } = filterState;

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
			<CaseFilters
				keyword={filters.kw}
				onKeywordChange={filterState.setKeyword}
				onPriorityChange={filterState.setPriority}
				onStatusChange={filterState.setStatus}
				onTagsChange={filterState.setTags}
				priority={filters.priority}
				projectId={projectId}
				status={filters.status}
				tags={filters.tags}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{hasData ? (
					<PickerTable
						cases={cases}
						onToggle={selection.toggleOne}
						onTogglePage={selection.togglePage}
						pageAllSelected={selection.pageAllSelected}
						selectedIds={selectedIds}
					/>
				) : (
					<PickerTableSkeleton />
				)}
			</div>
			<CasePagination
				onPageChange={filterState.setPage}
				page={filters.page}
				total={total}
			/>
		</div>
	);
}
