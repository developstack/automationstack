import type { User } from "@automationstack/db/schema/users";

/**
 * 会话 cookie 和 API token 能否继续使用（ADR 0008）。只有设置了本地密码的账号可以使用。
 * 以前的 Casdoor 账号没有本地密码，所以它们的旧会话和 API token 失效。
 * 管理员为这些账号重置密码后，它们才能登录。
 */
export function isSessionUserAllowed(
	user: Pick<User, "passwordHash">
): boolean {
	return user.passwordHash !== null;
}
