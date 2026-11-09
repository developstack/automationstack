import type { User } from "./schema/users";

type LocalLoginFields = Pick<User, "disabledAt" | "passwordHash" | "role">;

export type LocalLoginAdminBlocker = "disabled" | "no-password" | "not-admin";

/**
 * 账号不能作为「可以登录的管理员」的原因。返回 null 表示它是可以登录的管理员：
 * role = admin、未禁用、有密码哈希。条件与 countLocalLoginAdmins() 相同。
 */
export function localLoginAdminBlocker(
	user: LocalLoginFields
): LocalLoginAdminBlocker | null {
	if (user.passwordHash === null) {
		return "no-password";
	}
	if (user.disabledAt !== null) {
		return "disabled";
	}
	if (user.role !== "admin") {
		return "not-admin";
	}
	return null;
}
