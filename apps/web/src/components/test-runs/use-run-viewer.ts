import type { RunViewer } from "@automationstack/api/lib/test-run-access";

import { useSession } from "@/components/auth/use-session";

/** 当前用户对测试任务的权限输入。会话加载中时返回 null。 */
export function useRunViewer(): RunViewer | null {
	const { user } = useSession();
	return user === null ? null : { platformRole: user.role, userId: user.id };
}
