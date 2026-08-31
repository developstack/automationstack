/**
 * 项目成员表的加载骨架。原与 ProjectMembersTable 同住
 * project-members-table.tsx，按「一个文件一个对外组件」拆开。
 */
import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

/**
 * 项目成员表每一列的骨架形状，逐条对着 project-members-table.tsx 里
 * ProjectMembersTable 的表头与行填。
 *
 * **刻意不画行尾的操作列**：真表那一列由 canManage 决定在不在，而骨架此刻拿不到
 * 这个判断（成员列表与 auth.me 是同一批还没到的数据）。画了在只读视角下就是一列
 * 凭空多出来的灰条；不画只让其余几列横向各宽一点，不构成任何位移。
 */
const PROJECT_MEMBER_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-10", label: "用户名", value: "w-3/5", width: "flex-1" },
	{ head: "w-14", label: "项目角色", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "账号状态", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "加入时间", value: "w-3/4", width: "flex-1" },
];

/**
 * 路由 pendingComponent 用的表格骨架。
 * 行高与真实行（TableCell 的 p-2 + 内容 20px）对齐，数据到达时表格不会长高；
 * 行距沿用原来的 `grid gap-2`（TableSkeleton 的 spaced 档），也不画表头。
 */
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
