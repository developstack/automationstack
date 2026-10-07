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
				{member.role === "owner" ? (
					<DropdownMenuItem onClick={onDemote}>设为成员</DropdownMenuItem>
				) : (
					<DropdownMenuItem onClick={onPromote}>设为拥有者</DropdownMenuItem>
				)}
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
