import type { UserWithProjects } from "@automationstack/db/repositories/users-with-projects-core";
import { Badge } from "@automationstack/ui/components/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
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
import {
	AUTH_SOURCE_LABEL,
	type KnownProvider,
	platformUserActionAccess,
} from "@/components/platform-users/platform-user-access";
import { PLATFORM_ROLE_LABEL } from "@/components/platform-users/platform-user-meta";
import { PlatformUserRowActions } from "@/components/platform-users/platform-user-row-actions";
import { useKnownProvider } from "@/components/platform-users/use-known-provider";
import { UserProjectsCell } from "@/components/platform-users/user-projects-cell";
import { orpc } from "@/utils/orpc";

function PlatformUserRow({
	provider,
	row,
}: {
	provider: KnownProvider;
	row: UserWithProjects;
}) {
	const disabled = row.user.disabledAt !== null;
	const { authSource } = row.user;

	return (
		<TableRow>
			<TableCell className="font-medium">{row.user.username}</TableCell>
			<TableCell>
				<Badge variant={authSource === "casdoor" ? "secondary" : "outline"}>
					{AUTH_SOURCE_LABEL[authSource]}
				</Badge>
			</TableCell>
			<TableCell>{PLATFORM_ROLE_LABEL[row.user.role]}</TableCell>
			<TableCell>
				<Badge variant={disabled ? "outline" : "secondary"}>
					{disabled ? "已停用" : "启用"}
				</Badge>
			</TableCell>
			<TableCell>
				<UserProjectsCell projects={row.projects} />
			</TableCell>
			<TableCell className="text-muted-foreground tabular-nums">
				{formatDateTime(row.user.createdAt)}
			</TableCell>
			<TableCell className="text-right">
				<PlatformUserRowActions
					access={platformUserActionAccess(row.user, provider)}
					projects={row.projects}
					user={row.user}
				/>
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

export function PlatformUsersTable() {
	const usersQuery = useSuspenseQuery(
		orpc.users.listWithProjects.queryOptions()
	);
	const provider = useKnownProvider();

	if (usersQuery.data.length === 0) {
		return <PlatformUsersEmpty />;
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>用户名</TableHead>
					<TableHead>账号来源</TableHead>
					<TableHead>平台角色</TableHead>
					<TableHead>状态</TableHead>
					<TableHead>所属项目</TableHead>
					<TableHead>创建时间</TableHead>
					<TableHead className="text-right">
						<span className="sr-only">操作</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{usersQuery.data.map((row) => (
					<PlatformUserRow key={row.user.id} provider={provider} row={row} />
				))}
			</TableBody>
		</Table>
	);
}
