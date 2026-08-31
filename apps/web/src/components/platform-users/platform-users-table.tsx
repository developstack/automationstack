import type { UserWithProjects } from "@automationstack/db/repositories/users-with-projects-core";
import { Badge } from "@automationstack/ui/components/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { useSuspenseQuery } from "@tanstack/react-query";

import { formatDateTime } from "@/components/cases/case-meta";
import { PLATFORM_ROLE_LABEL } from "@/components/platform-users/platform-user-meta";
import { PlatformUserRowActions } from "@/components/platform-users/platform-user-row-actions";
import { UserProjectsCell } from "@/components/platform-users/user-projects-cell";
import { orpc } from "@/utils/orpc";

/**
 * 一行 = 一个人，不重复。
 *
 * 收整行 `UserWithProjects`（`{ projects, user }`）而不是在调用处摊平成两个
 * prop：这一行里两块数据都要用（账号那几列用 `row.user`，「所属项目」那一列用
 * `row.projects`），而 key 又只能从 `row.user.id` 取。收整行，行组件与服务端那条
 * 查询的形状就是一一对应的，将来那条查询多带一块东西回来时，改的只有这里。
 * 再往下就摊开了：行操作只认 `PublicUser`，所以传下去的是 `row.user`。
 */
function PlatformUserRow({ row }: { row: UserWithProjects }) {
	const disabled = row.user.disabledAt !== null;

	return (
		<TableRow>
			<TableCell className="font-medium">{row.user.username}</TableCell>
			<TableCell>{PLATFORM_ROLE_LABEL[row.user.role]}</TableCell>
			<TableCell>
				{/*
				 * 停用态用 outline：已停用的行本来就该退到背景里，
				 * 用 destructive 会让「这个人被停用了」看起来像一条待处理的报错。
				 */}
				<Badge variant={disabled ? "outline" : "secondary"}>
					{disabled ? "已停用" : "启用"}
				</Badge>
			</TableCell>
			<TableCell>
				<UserProjectsCell projects={row.projects} />
			</TableCell>
			{/* tabular-nums：时间戳里的数字等宽，整列的年月日才竖着对齐 */}
			<TableCell className="text-muted-foreground tabular-nums">
				{formatDateTime(row.user.createdAt)}
			</TableCell>
			<TableCell className="text-right">
				<PlatformUserRowActions projects={row.projects} user={row.user} />
			</TableCell>
		</TableRow>
	);
}

function PlatformUsersEmpty() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>还没有用户</EmptyTitle>
				<EmptyDescription>点击「新建用户」创建第一个账号。</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

const SKELETON_ROW_KEYS = ["r1", "r2", "r3", "r4"] as const;

/**
 * 路由 pendingComponent 用的表格骨架。
 * 行高与真实行（TableCell 的 p-2 + 内容 20px）对齐，数据到达时表格不会长高。
 * 圆角覆盖成 rounded-none：替身要跟真身同形，而表格行是方角的。
 *
 * 「所属项目」那一列会让某些行比骨架高，这一点没法在骨架里预演——那一列的高度
 * 取决于每个人在几个项目里，而骨架的全部意义就是在数据到达之前占位。认了。
 */
export function PlatformUsersTableSkeleton() {
	return (
		<output aria-busy="true" aria-label="用户列表加载中" className="grid gap-2">
			{SKELETON_ROW_KEYS.map((key) => (
				<Skeleton className="h-9 w-full rounded-none" key={key} />
			))}
		</output>
	);
}

export function PlatformUsersTable() {
	const usersQuery = useSuspenseQuery(
		orpc.users.listWithProjects.queryOptions()
	);

	if (usersQuery.data.length === 0) {
		return <PlatformUsersEmpty />;
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>用户名</TableHead>
					<TableHead>平台角色</TableHead>
					<TableHead>状态</TableHead>
					<TableHead>所属项目</TableHead>
					<TableHead>创建时间</TableHead>
					{/* 空表头会被读屏念成一列没名字的单元格，用视觉隐藏的文字补上 */}
					<TableHead className="text-right">
						<span className="sr-only">操作</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{/*
				 * 顺序原样照抄服务端：用户按 createdAt 升序，每个人内部的项目按项目名
				 * 升序。前端不再排一次——同一份顺序两处各排一遍，迟早有一处先改。
				 */}
				{usersQuery.data.map((row) => (
					<PlatformUserRow key={row.user.id} row={row} />
				))}
			</TableBody>
		</Table>
	);
}
