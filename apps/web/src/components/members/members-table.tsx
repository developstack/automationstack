import type { PublicUser } from "@automationstack/db/schema/users";
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
import { ROLE_LABEL } from "@/components/members/member-meta";
import { MemberRowActions } from "@/components/members/member-row-actions";
import { orpc } from "@/utils/orpc";

function MemberRow({ member }: { member: PublicUser }) {
	const disabled = member.disabledAt !== null;

	return (
		<TableRow>
			<TableCell className="font-medium">{member.username}</TableCell>
			<TableCell>{ROLE_LABEL[member.role]}</TableCell>
			<TableCell>
				{/*
				 * 停用态用 outline：已停用的行本来就该退到背景里，
				 * 用 destructive 会让「这个人被停用了」看起来像一条待处理的报错。
				 */}
				<Badge variant={disabled ? "outline" : "secondary"}>
					{disabled ? "已停用" : "启用"}
				</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{formatDateTime(member.createdAt)}
			</TableCell>
			<TableCell className="text-right">
				<MemberRowActions member={member} />
			</TableCell>
		</TableRow>
	);
}

function MembersEmpty() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>还没有成员</EmptyTitle>
				<EmptyDescription>点击「新建成员」创建第一个账号。</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

const SKELETON_ROW_KEYS = ["r1", "r2", "r3", "r4"] as const;

/**
 * 路由 pendingComponent 用的表格骨架。
 * 行高与真实行（TableCell 的 p-2 + 内容 20px）对齐，数据到达时表格不会长高。
 * 圆角覆盖成 rounded-none 的理由同 case-table：替身要跟真身同形，而表格行是方角的。
 */
export function MembersTableSkeleton() {
	return (
		<output aria-busy="true" aria-label="成员列表加载中" className="grid gap-2">
			{SKELETON_ROW_KEYS.map((key) => (
				<Skeleton className="h-9 w-full rounded-none" key={key} />
			))}
		</output>
	);
}

export function MembersTable() {
	const membersQuery = useSuspenseQuery(orpc.users.list.queryOptions());

	if (membersQuery.data.length === 0) {
		return <MembersEmpty />;
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>用户名</TableHead>
					<TableHead>角色</TableHead>
					<TableHead>状态</TableHead>
					<TableHead>创建时间</TableHead>
					{/* 空表头会被读屏念成一列没名字的单元格，用视觉隐藏的文字补上 */}
					<TableHead className="text-right">
						<span className="sr-only">操作</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{membersQuery.data.map((member) => (
					<MemberRow key={member.id} member={member} />
				))}
			</TableBody>
		</Table>
	);
}
