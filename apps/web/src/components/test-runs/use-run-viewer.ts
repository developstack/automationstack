import type { RunViewer } from "@automationstack/api/lib/test-run-access";
import { useQuery } from "@tanstack/react-query";

import { useSession } from "@/components/auth/use-session";
import { viewerProjectAccess } from "@/components/project-members/project-member-meta";
import { orpc } from "@/utils/orpc";

/** 当前用户对项目里测试任务的权限输入。会话或成员列表加载中时返回 null。 */
export function useRunViewer(projectId: string): RunViewer | null {
	const { user } = useSession();
	const membersQuery = useQuery(
		orpc.projectMembers.list.queryOptions({ input: { projectId } })
	);
	if (user === null || membersQuery.data === undefined) {
		return null;
	}
	return { ...viewerProjectAccess(user, membersQuery.data), userId: user.id };
}
