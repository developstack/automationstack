/**
 * 「必须修改密码」闸门（plan 021 T4）。
 * 这个文件不导入服务端依赖：apps/web 也从这里读取错误码。
 */

/** must_change_password = true 时，其他接口返回的 ORPCError code。HTTP 状态为 403。 */
export const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

export const PASSWORD_CHANGE_REQUIRED_STATUS = 403;

export const PASSWORD_CHANGE_REQUIRED_MESSAGE =
	"请先修改密码，然后才能继续使用";

const EXEMPT_PATHS: ReadonlySet<string> = new Set([
	"auth.changePassword",
	"auth.logout",
	"auth.me",
]);

/** 必须修改密码的用户能否调用这个接口。path 是 oRPC 的路由路径，例如 ["auth", "me"]。 */
export function isPasswordChangeExempt(path: readonly string[]): boolean {
	return EXEMPT_PATHS.has(path.join("."));
}

export function isBlockedByPasswordChange(
	user: { mustChangePassword: boolean },
	path: readonly string[]
): boolean {
	return user.mustChangePassword && !isPasswordChangeExempt(path);
}
