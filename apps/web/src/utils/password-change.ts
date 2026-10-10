import { PASSWORD_CHANGE_REQUIRED } from "@automationstack/api/auth/password-change-gate";
import { ORPCError } from "@orpc/client";

export const CHANGE_PASSWORD_PATHNAME = "/change-password";

export function isChangePasswordPathname(pathname: string): boolean {
	return (
		pathname === CHANGE_PASSWORD_PATHNAME ||
		pathname === `${CHANGE_PASSWORD_PATHNAME}/`
	);
}

/** 服务端要求先修改密码（must_change_password = true）。这不是会话过期，不能跳到登录页。 */
export function isPasswordChangeRequiredError(error: unknown): boolean {
	return error instanceof ORPCError && error.code === PASSWORD_CHANGE_REQUIRED;
}

type PasswordChangeRequiredHandler = () => Promise<void>;

let handlePasswordChangeRequired: PasswordChangeRequiredHandler | null = null;
let redirecting = false;

export function setPasswordChangeRequiredHandler(
	handler: PasswordChangeRequiredHandler | null
): void {
	handlePasswordChangeRequired = handler;
}

/** 多条查询同时收到这个错误时，只跳转一次。跳转结束后允许再次触发。 */
export function notifyPasswordChangeRequired(): void {
	if (redirecting || handlePasswordChangeRequired === null) {
		return;
	}
	redirecting = true;
	handlePasswordChangeRequired()
		.catch(() => undefined)
		.finally(() => {
			redirecting = false;
		});
}
