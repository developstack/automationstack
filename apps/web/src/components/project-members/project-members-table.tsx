import type { ProjectMemberView } from "@automationstack/db/repositories/project-members-repository";
import { Badge } from "@automationstack/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { useCurrentUser } from "@/components/auth/use-session";
import { formatDateTime } from "@/components/cases/case-meta";
import { PROJECT_ROLE_LABEL } from "@/components/project-members/project-member-meta";
import { ProjectMemberRowActions } from "@/components/project-members/project-member-row-actions";

interface ProjectMemberRowProps {
	canManage: boolean;
	isSelf: boolean;
	member: ProjectMemberView;
	projectId: string;
}

function ProjectMemberRow({
	canManage,
	isSelf,
	member,
	projectId,
}: ProjectMemberRowProps) {
	const disabled = member.disabledAt !== null;

	return (
		<TableRow>
			<TableCell className="font-medium">{member.username}</TableCell>
			<TableCell>{PROJECT_ROLE_LABEL[member.role]}</TableCell>
			<TableCell>
				<Badge variant={disabled ? "outline" : "secondary"}>
					{disabled ? "已停用" : "启用"}
				</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{formatDateTime(member.createdAt)}
			</TableCell>
			{canManage ? (
				<TableCell className="text-right">
					<ProjectMemberRowActions
						isSelf={isSelf}
						member={member}
						projectId={projectId}
					/>
				</TableCell>
			) : null}
		</TableRow>
	);
}

interface ProjectMembersTableProps {
	canManage: boolean;
	members: readonly ProjectMemberView[];
	projectId: string;
}

export function ProjectMembersTable({
	canManage,
	members,
	projectId,
}: ProjectMembersTableProps) {
	const currentUser = useCurrentUser();

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>用户名</TableHead>
					<TableHead>项目角色</TableHead>
					<TableHead>账号状态</TableHead>
					<TableHead>加入时间</TableHead>
					{canManage ? (
						<TableHead className="text-right">
							<span className="sr-only">操作</span>
						</TableHead>
					) : null}
				</TableRow>
			</TableHeader>
			<TableBody>
				{members.map((member) => (
					<ProjectMemberRow
						canManage={canManage}
						isSelf={member.userId === currentUser.id}
						key={member.userId}
						member={member}
						projectId={projectId}
					/>
				))}
			</TableBody>
		</Table>
	);
}
