import { Button } from "@automationstack/ui/components/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { UserPlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { useSession } from "@/components/auth/use-session";
import { PageTransition } from "@/components/layout/page-transition";
import { AddProjectMemberDialog } from "@/components/project-members/add-project-member-dialog";
import { canManageProjectMembers } from "@/components/project-members/project-member-meta";
import { ProjectMembersTable } from "@/components/project-members/project-members-table";
import { orpc } from "@/utils/orpc";

export const PROJECT_MEMBERS_MAIN =
	"flex min-h-0 flex-col gap-3 overflow-y-auto p-4";

function ProjectMembersHint({ canManage }: { canManage: boolean }) {
	return (
		<p className="text-muted-foreground text-xs">
			{canManage
				? "项目拥有者可以添加成员、调整项目角色、把人移出项目。项目至少要留一个拥有者。"
				: "本项目的成员名单。添加成员、调整角色需要项目拥有者权限，找名单里的拥有者即可。"}
		</p>
	);
}

interface ProjectMembersViewProps {
	projectId: string;
}

export function ProjectMembersView({ projectId }: ProjectMembersViewProps) {
	const membersQuery = useSuspenseQuery(
		orpc.projectMembers.list.queryOptions({ input: { projectId } })
	);
	const { user } = useSession();
	const canManage = canManageProjectMembers(user, membersQuery.data);
	const [adding, setAdding] = useState(false);
	const openAdd = useCallback(() => setAdding(true), []);
	const closeAdd = useCallback(() => setAdding(false), []);

	return (
		<PageTransition className={PROJECT_MEMBERS_MAIN} phase="ready">
			<div className="flex items-center justify-between gap-2">
				<ProjectMembersHint canManage={canManage} />
				{canManage ? (
					<Button onClick={openAdd}>
						<UserPlusIcon aria-hidden="true" data-icon="inline-start" />
						添加成员
					</Button>
				) : null}
			</div>
			<ProjectMembersTable
				canManage={canManage}
				members={membersQuery.data}
				projectId={projectId}
			/>
			{canManage ? (
				<AddProjectMemberDialog
					onClose={closeAdd}
					open={adding}
					projectId={projectId}
				/>
			) : null}
		</PageTransition>
	);
}
