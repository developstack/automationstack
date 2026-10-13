import { useQuery } from "@tanstack/react-query";

import { useSession } from "@/components/auth/use-session";
import { viewerProjectRoleLabel } from "@/components/project-members/project-member-meta";
import { orpc } from "@/utils/orpc";

export interface ViewerProjectRole {
	isPending: boolean;
	label: string | null;
}

/** 当前用户在项目中的角色名称。成员列表加载中时 isPending 为 true。 */
export function useViewerProjectRole(projectId: string): ViewerProjectRole {
	const { user } = useSession();
	const membersQuery = useQuery(
		orpc.projectMembers.list.queryOptions({ input: { projectId } })
	);
	if (user === null || membersQuery.data === undefined) {
		return { isPending: membersQuery.isPending, label: null };
	}
	return {
		isPending: false,
		label: viewerProjectRoleLabel(user, membersQuery.data),
	};
}
