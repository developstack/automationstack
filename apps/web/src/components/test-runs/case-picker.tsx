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
 *
 * 这个文件只剩下「谁在哪一格」的组装：状态在 `case-picker-state.ts`，
 * 右栏与底栏各自成文件，模块树与表格早先已经拆出去（见仓库 300 行文件上限）。
 */
import { useMemo } from "react";

import { CasePickerModules } from "@/components/test-runs/case-picker-modules";
import { CasePickerResults } from "@/components/test-runs/case-picker-results";
import {
	useCasePickerCases,
	useCasePickerSelection,
	usePickerFilters,
} from "@/components/test-runs/case-picker-state";
import { CasePickerSummary } from "@/components/test-runs/case-picker-summary";

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
	const filterState = usePickerFilters();
	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const casesQuery = useCasePickerCases(projectId, filterState.filters);
	const items = casesQuery.data?.items ?? [];
	const selection = useCasePickerSelection({
		items,
		onChange,
		selectedIds,
		selectedSet,
	});

	// `data` 为空只有首屏一种情况：翻页与改筛选靠 keepPreviousData 留住上一页。
	const hasData = casesQuery.data !== undefined;
	const total = casesQuery.data?.total ?? 0;

	return (
		<div className="flex min-h-0 flex-col gap-3">
			<div className="flex min-h-0 flex-1 gap-3">
				<div className="w-52 shrink-0 overflow-y-auto rounded-md border">
					<CasePickerModules
						onSelect={filterState.setModuleId}
						projectId={projectId}
						selectedModuleId={filterState.filters.moduleId}
					/>
				</div>
				<CasePickerResults
					cases={items}
					filterState={filterState}
					hasData={hasData}
					projectId={projectId}
					selectedIds={selectedSet}
					selection={selection}
					total={total}
				/>
			</div>
			<CasePickerSummary
				hasData={hasData}
				onClear={selection.clearSelection}
				page={filterState.filters.page}
				selectedCount={selectedIds.length}
				total={total}
			/>
		</div>
	);
}
