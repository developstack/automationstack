import { CASE_PAGE_SIZE } from "@/components/cases/case-list-query";
import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

const CASE_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-7", label: "名称", value: "w-4/5", width: "flex-1" },
	{ head: "w-10", label: "优先级", value: "w-2/3", width: "w-16 shrink-0" },
	{ head: "w-7", label: "类型", value: "w-2/3", width: "w-16 shrink-0" },
	{ head: "w-7", label: "状态", value: "w-3/4", width: "w-20 shrink-0" },
	{ head: "w-7", label: "标签", value: "w-2/3", width: "flex-1" },
	{ head: "w-10", label: "维护人", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "更新时间", value: "w-full", width: "w-28 shrink-0" },
	{ head: "w-7", label: "协作", value: "w-2/3", width: "w-24 shrink-0" },
];

interface CaseTableSkeletonProps {
	rows?: number;
}

export function CaseTableSkeleton({
	rows = CASE_PAGE_SIZE,
}: CaseTableSkeletonProps) {
	return (
		<TableSkeleton
			columns={CASE_SKELETON_COLUMNS}
			label="用例列表加载中"
			rows={rows}
		/>
	);
}
