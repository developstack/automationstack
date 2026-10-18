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
import {
	type ProjectMemberConfirmKind,
	projectMemberActionsFor,
} from "@/components/project-members/project-member-meta";
import { useProjectMemberActions } from "@/components/project-members/use-project-member-actions";

interface ProjectMemberActionsMenuProps {
	kinds: readonly ProjectMemberConfirmKind[];
	member: ProjectMemberView;
	onOpen: OpenConfirm;
}

const ACTION_LABEL: Record<ProjectMemberConfirmKind, string> = {
	demote: "设为成员",
	promote: "设为拥有者",
	remove: "移出项目",
};

type OpenConfirm = (kind: ProjectMemberConfirmKind) => void;

interface ActionItemProps {
	kind: ProjectMemberConfirmKind;
	onOpen: OpenConfirm;
}

function ActionItem({ kind, onOpen }: ActionItemProps) {
	const handleClick = useCallback(() => onOpen(kind), [kind, onOpen]);
	return (
		<DropdownMenuItem
			onClick={handleClick}
			variant={kind === "remove" ? "destructive" : "default"}
		>
			{ACTION_LABEL[kind]}
		</DropdownMenuItem>
	);
}

function ProjectMemberActionsMenu({
	kinds,
	member,
	onOpen,
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
				{kinds.map((kind) => (
					<ActionItem key={kind} kind={kind} onOpen={onOpen} />
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

interface ProjectMemberRowActionsProps {
	isSelf: boolean;
	member: ProjectMemberView;
	/** 项目中拥有者的数量 */
	ownerCount: number;
	projectId: string;
}

export function ProjectMemberRowActions({
	isSelf,
	member,
	ownerCount,
	projectId,
}: ProjectMemberRowActionsProps) {
	const actions = useProjectMemberActions(projectId, member);
	// 与服务端的规则相同；一项都不能用时不显示菜单按钮
	const kinds = projectMemberActionsFor({ isSelf, member, ownerCount });
	if (kinds.length === 0) {
		return null;
	}
	return (
		<>
			<ProjectMemberActionsMenu
				kinds={kinds}
				member={member}
				onOpen={actions.open}
			/>
			<ProjectMemberConfirmDialog actions={actions} member={member} />
		</>
	);
}
