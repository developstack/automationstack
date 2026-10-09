import type { User } from "./schema/users";

type LocalLoginFields = Pick<
	User,
	"authSource" | "disabledAt" | "passwordHash" | "role"
>;

/**
 * 账号的本地密码哈希。只有 auth_source = local 并且有哈希的账号才有本地密码。
 * 返回 null 表示这个账号不能用本地密码登录。
 */
export function localPasswordHashOf(
	user: Pick<User, "authSource" | "passwordHash">
): string | null {
	if (user.authSource !== "local") {
		return null;
	}
	return user.passwordHash;
}

export type LocalLoginAdminBlocker =
	| "disabled"
	| "external-account"
	| "no-password"
	| "not-admin";

/**
 * 账号不能作为「本地登录管理员」的原因。返回 null 表示它是本地登录管理员：
 * role = admin、未禁用、auth_source = local、有密码哈希。
 * 条件与 countLocalLoginAdmins() 相同。
 */
export function localLoginAdminBlocker(
	user: LocalLoginFields
): LocalLoginAdminBlocker | null {
	if (user.authSource !== "local") {
		return "external-account";
	}
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
