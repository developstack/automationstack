import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

const API_TOKEN_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-10", label: "备注名", value: "w-3/5", width: "flex-1" },
	{ head: "w-7", label: "前缀", value: "w-1/2", width: "flex-1" },
	{ head: "w-7", label: "状态", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "创建时间", value: "w-3/4", width: "flex-1" },
	{ head: "w-14", label: "最后使用", value: "w-3/4", width: "flex-1" },
	{
		head: "w-0",
		label: "操作",
		value: "w-full",
		width: "flex w-20 shrink-0 justify-end",
	},
];

export function ApiTokensTableSkeleton() {
	return (
		<TableSkeleton
			columns={API_TOKEN_SKELETON_COLUMNS}
			label="Token 列表加载中"
			rowHeight="h-11"
			rows={3}
		/>
	);
}
