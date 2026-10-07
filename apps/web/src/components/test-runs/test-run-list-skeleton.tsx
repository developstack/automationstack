import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

const TEST_RUN_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-14", label: "测试任务", value: "w-4/5", width: "flex-1" },
	{ head: "w-7", label: "状态", value: "w-1/2", width: "w-24 shrink-0" },
	{ head: "w-7", label: "进度", value: "w-1/2", width: "w-24 shrink-0" },
	{ head: "w-10", label: "通过率", value: "w-1/2", width: "w-20 shrink-0" },
	{ head: "w-10", label: "创建人", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "创建时间", value: "w-full", width: "w-28 shrink-0" },
	{ head: "w-0", label: "操作", value: "w-8", width: "w-12 shrink-0" },
];

export function TestRunListSkeleton() {
	return (
		<TableSkeleton
			columns={TEST_RUN_SKELETON_COLUMNS}
			label="测试任务列表加载中"
			rows={5}
		/>
	);
}
