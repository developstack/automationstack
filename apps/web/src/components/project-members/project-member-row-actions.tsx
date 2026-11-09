import type { ProjectMemberView } from "@automationstack/db/repositories/project-members-repository";
import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";

import { ProjectMemberConfirmDialog } from "@/components/project-members/project-member-confirm-dialog";
import { useProjectMemberActions } from "@/components/project-members/use-project-member-actions";

interface ProjectMemberRowActionsProps {
	isSelf: boolean;
	member: ProjectMemberView;
	projectId: string;
}

/** 成员行的菜单只有「移出项目」。与服务端的规则相同：不能移出自己，这时不显示菜单按钮。 */
export function ProjectMemberRowActions({
	isSelf,
	member,
	projectId,
}: ProjectMemberRowActionsProps) {
	const actions = useProjectMemberActions(projectId, member);
	if (isSelf) {
		return null;
	}
	return (
		<>
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
					<DropdownMenuItem onClick={actions.open} variant="destructive">
						移出项目
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ProjectMemberConfirmDialog actions={actions} member={member} />
		</>
	);
}
