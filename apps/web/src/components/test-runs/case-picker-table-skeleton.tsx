import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

/**
 * 用例选择器右栏那张表的加载骨架（从 `case-picker-table.tsx` 拆出来）。
 */

/**
 * 挑选器表每一列的骨架形状，逐条对着 case-picker-table.tsx 里
 * CasePickerTable 的表头与 PickerRow 的单元格填。首列是 w-8 的勾选框列，
 * 去掉 px-2 之后正好剩 16px，与 Checkbox 的 size-4 同宽。
 */
const PICKER_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-4", label: "勾选", value: "w-4", width: "w-8 shrink-0" },
	{ head: "w-7", label: "名称", value: "w-4/5", width: "flex-1" },
	{ head: "w-10", label: "优先级", value: "w-2/3", width: "w-16 shrink-0" },
	{ head: "w-7", label: "状态", value: "w-3/4", width: "w-20 shrink-0" },
];

/**
 * 高度折算同 cases/case-table-skeleton.tsx（表头 41px、数据行 37px），
 * 由 TableSkeleton 的 bordered 档统一给出，这里只描列的形状。
 */
export function CasePickerTableSkeleton() {
	return (
		<TableSkeleton
			columns={PICKER_SKELETON_COLUMNS}
			label="用例列表加载中"
			rows={6}
		/>
	);
}
