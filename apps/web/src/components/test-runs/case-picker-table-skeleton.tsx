import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

const PICKER_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-4", label: "勾选", value: "w-4", width: "w-8 shrink-0" },
	{ head: "w-7", label: "名称", value: "w-4/5", width: "flex-1" },
	{ head: "w-10", label: "优先级", value: "w-2/3", width: "w-16 shrink-0" },
	{ head: "w-7", label: "状态", value: "w-3/4", width: "w-20 shrink-0" },
];

export function CasePickerTableSkeleton() {
	return (
		<TableSkeleton
			columns={PICKER_SKELETON_COLUMNS}
			label="用例列表加载中"
			rows={6}
		/>
	);
}
