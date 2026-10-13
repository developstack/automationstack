import { Button } from "@automationstack/ui/components/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { UserPlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { useSession } from "@/components/auth/use-session";
import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { AddProjectMemberDialog } from "@/components/project-members/add-project-member-dialog";
import {
	canManageProjectMembers,
	isSuspendedOwner,
	SUSPENDED_OWNER_HINT,
} from "@/components/project-members/project-member-meta";
import { ProjectMembersTable } from "@/components/project-members/project-members-table";
import { orpc } from "@/utils/orpc";

export const PROJECT_MEMBERS_MAIN =
	"flex min-h-0 flex-col gap-3 overflow-y-auto p-4";

interface ProjectMembersHintProps {
	canManage: boolean;
	suspended: boolean;
}

function hintText({ canManage, suspended }: ProjectMembersHintProps): string {
	if (canManage) {
		return "项目拥有者可以添加成员、调整项目角色、把人移出项目。项目至少要留一个拥有者。";
	}
	if (suspended) {
		return SUSPENDED_OWNER_HINT;
	}
	return "本项目的成员名单。添加成员、调整角色需要项目拥有者权限，找名单里的拥有者即可。";
}

function ProjectMembersHint(props: ProjectMembersHintProps) {
	return <p className="text-muted-foreground text-xs">{hintText(props)}</p>;
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
	const suspended = isSuspendedOwner(user, membersQuery.data);
	const [adding, setAdding] = useState(false);
	const openAdd = useCallback(() => setAdding(true), []);
	const closeAdd = useCallback(() => setAdding(false), []);

	return (
		<PageTransition className={PROJECT_MEMBERS_MAIN} phase="ready">
			<PageHeader
				actions={
					canManage ? (
						<Button onClick={openAdd}>
							<UserPlusIcon aria-hidden="true" data-icon="inline-start" />
							添加成员
						</Button>
					) : undefined
				}
				title={WORKSPACE_VIEW_LABELS.users}
			/>
			<ProjectMembersHint canManage={canManage} suspended={suspended} />
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
