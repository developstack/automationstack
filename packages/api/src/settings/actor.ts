import { getUserById } from "@automationstack/db/repositories/users-repository";

/** 保存设置的人。修改记录使用它。 */
export interface SettingsActor {
	id: string;
	username: string;
}

/** 用户 id 对应的用户名。用户不存在时返回 null。 */
export async function usernameOf(
	userId: string | null
): Promise<string | null> {
	if (userId === null) {
		return null;
	}
	const user = await getUserById(userId);
	return user?.username ?? null;
}
