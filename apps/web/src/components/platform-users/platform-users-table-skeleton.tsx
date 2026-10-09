import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

const PLATFORM_USER_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-10", label: "用户名", value: "w-3/5", width: "flex-1" },
	{ head: "w-14", label: "账号来源", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "平台角色", value: "w-1/2", width: "flex-1" },
	{ head: "w-7", label: "状态", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "所属项目", value: "w-2/3", width: "flex-1" },
	{ head: "w-14", label: "创建时间", value: "w-3/4", width: "flex-1" },
	{
		head: "w-0",
		label: "操作",
		value: "w-8",
		width: "flex w-12 shrink-0 justify-end",
	},
];

export function PlatformUsersTableSkeleton() {
	return (
		<TableSkeleton
			columns={PLATFORM_USER_SKELETON_COLUMNS}
			header={false}
			label="用户列表加载中"
			rows={4}
			spacing="spaced"
		/>
	);
}
