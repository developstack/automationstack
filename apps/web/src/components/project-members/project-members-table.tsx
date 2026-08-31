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
import { formatDateTime } from "@/components/cases/case-meta";
import { PROJECT_ROLE_LABEL } from "@/components/project-members/project-member-meta";
import { ProjectMemberRowActions } from "@/components/project-members/project-member-row-actions";

interface ProjectMemberRowProps {
	canManage: boolean;
	member: ProjectMemberView;
	projectId: string;
}

function ProjectMemberRow({
	canManage,
	member,
	projectId,
}: ProjectMemberRowProps) {
	const disabled = member.disabledAt !== null;

	return (
		<TableRow>
			<TableCell className="font-medium">{member.username}</TableCell>
			<TableCell>{PROJECT_ROLE_LABEL[member.role]}</TableCell>
			<TableCell>
				{/*
				 * 这一列说的是**平台账号**的状态，不是他在本项目里的状态：账号被停用
				 * 的人仍然留在成员名单里（停用是可逆的，移出项目才是删这一行），但他
				 * 登不进来。不标出来的话，名单上会有一个谁都等不到的人。
				 * 停用态用 outline 而不是 destructive：已停用的行该退到背景里，
				 * 不该看起来像一条待处理的报错。
				 */}
				<Badge variant={disabled ? "outline" : "secondary"}>
					{disabled ? "已停用" : "启用"}
				</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{formatDateTime(member.createdAt)}
			</TableCell>
			{canManage ? (
				<TableCell className="text-right">
					<ProjectMemberRowActions member={member} projectId={projectId} />
				</TableCell>
			) : null}
		</TableRow>
	);
}

interface ProjectMembersTableProps {
	/** 有管理权限时才多出行尾那一列；无权限时整列不存在，而不是画一排灰按钮。 */
	canManage: boolean;
	members: readonly ProjectMemberView[];
	projectId: string;
}

/**
 * 成员名单。数据由调用方（project-members-page）传进来而不是自己再查一次：
 * 那一层已经为了算权限订阅了同一条查询，这里再来一次就是同一份数据两个订阅。
 *
 * 没有空态：项目至少有一个 owner（建项目时与 owner 记录在同一个事务里写入，
 * 而最后一个 owner 又不许被移除），空名单意味着数据已经坏了，此时摆一句
 * 「还没有成员，去加一个吧」是在误导人。
 */
export function ProjectMembersTable({
	canManage,
	members,
	projectId,
}: ProjectMembersTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>用户名</TableHead>
					<TableHead>项目角色</TableHead>
					<TableHead>账号状态</TableHead>
					<TableHead>加入时间</TableHead>
					{/* 空表头会被读屏念成一列没名字的单元格，用视觉隐藏的文字补上 */}
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
						key={member.userId}
						member={member}
						projectId={projectId}
					/>
				))}
			</TableBody>
		</Table>
	);
}
