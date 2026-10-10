import { canBecomeProjectOwner } from "@automationstack/api/lib/project-access";
import type { ProjectMemberView } from "@automationstack/db/repositories/project-members-repository";
import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import { useCallback } from "react";

import { ProjectMemberConfirmDialog } from "@/components/project-members/project-member-confirm-dialog";
import { useProjectMemberActions } from "@/components/project-members/use-project-member-actions";

interface ProjectMemberActionsMenuProps {
	isSelf: boolean;
	member: ProjectMemberView;
	onDemote: () => void;
	onPromote: () => void;
	onRemove: () => void;
}

function RoleChangeItem({
	member,
	onDemote,
	onPromote,
}: Pick<ProjectMemberActionsMenuProps, "member" | "onDemote" | "onPromote">) {
	if (member.role === "owner") {
		return <DropdownMenuItem onClick={onDemote}>设为成员</DropdownMenuItem>;
	}
	// 普通用户不能成为项目拥有者：禁用这一项，并在名称里说明原因。服务端也检查。
	if (!canBecomeProjectOwner(member.platformRole)) {
		return (
			<DropdownMenuItem disabled={true}>
				设为拥有者（普通用户不能成为拥有者）
			</DropdownMenuItem>
		);
	}
	return <DropdownMenuItem onClick={onPromote}>设为拥有者</DropdownMenuItem>;
}

function ProjectMemberActionsMenu({
	isSelf,
	member,
	onDemote,
	onPromote,
	onRemove,
}: ProjectMemberActionsMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						aria-label={`成员「${member.username}」操作`}
						size="icon-xs"
						variant="ghost"
					>
						<MoreHorizontalIcon />
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				<RoleChangeItem
					member={member}
					onDemote={onDemote}
					onPromote={onPromote}
				/>
				{isSelf ? null : (
					<DropdownMenuItem onClick={onRemove} variant="destructive">
						移出项目
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

interface ProjectMemberRowActionsProps {
	isSelf: boolean;
	member: ProjectMemberView;
	projectId: string;
}

export function ProjectMemberRowActions({
	isSelf,
	member,
	projectId,
}: ProjectMemberRowActionsProps) {
	const actions = useProjectMemberActions(projectId, member);
	const { open } = actions;
	const askDemote = useCallback(() => open("demote"), [open]);
	const askPromote = useCallback(() => open("promote"), [open]);
	const askRemove = useCallback(() => open("remove"), [open]);

	return (
		<>
			<ProjectMemberActionsMenu
				isSelf={isSelf}
				member={member}
				onDemote={askDemote}
				onPromote={askPromote}
				onRemove={askRemove}
			/>
			<ProjectMemberConfirmDialog actions={actions} member={member} />
		</>
	);
}
