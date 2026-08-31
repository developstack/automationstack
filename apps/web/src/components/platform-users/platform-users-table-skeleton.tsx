/**
 * 平台用户表的加载骨架。原与 PlatformUsersTable 同住
 * platform-users-table.tsx，按「一个文件一个对外组件」拆开。
 */
import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

/**
 * 平台用户表每一列的骨架形状，逐条对着 platform-users-table.tsx 里
 * PlatformUsersTable 的表头与行填。
 * 真表头没有列宽类，自由文本列一律 flex-1；行尾只有一颗图标按钮，钉成 w-12
 * 并右对齐。操作列的表头是 sr-only，head 取 w-0。
 */
const PLATFORM_USER_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-10", label: "用户名", value: "w-3/5", width: "flex-1" },
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

/**
 * 路由 pendingComponent 用的表格骨架。
 * 行高与真实行（TableCell 的 p-2 + 内容 20px）对齐，数据到达时表格不会长高；
 * 行与行之间沿用原来的 `grid gap-2`（TableSkeleton 的 spaced 档）。
 * 不画表头：这一份原本就没有，凭空补一条会高出 41px。
 *
 * 「所属项目」那一列会让某些行比骨架高，这一点没法在骨架里预演——那一列的高度
 * 取决于每个人在几个项目里，而骨架的全部意义就是在数据到达之前占位。认了。
 */
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
