import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

const PROJECT_MEMBER_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-10", label: "用户名", value: "w-3/5", width: "flex-1" },
	{ head: "w-14", label: "项目角色", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "账号状态", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "加入时间", value: "w-3/4", width: "flex-1" },
];

export function ProjectMembersTableSkeleton() {
	return (
		<TableSkeleton
			columns={PROJECT_MEMBER_SKELETON_COLUMNS}
			header={false}
			label="成员列表加载中"
			rows={4}
			spacing="spaced"
		/>
	);
}
