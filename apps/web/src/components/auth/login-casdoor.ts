import {
	CASDOOR_LOGIN_ERROR_MESSAGES,
	isCasdoorLoginErrorCode,
} from "@automationstack/api/auth/casdoor/login-errors";

const LOGIN_REDIRECT_PARAM = "redirect";

/** 不认识的错误码使用的提示。 */
export const CASDOOR_LOGIN_GENERIC_ERROR =
	"Casdoor 登录没有完成，请重新登录。问题持续时请联系管理员";

/**
 * 登录后跳转的地址只接受本站的路径：以 / 开头，不以 // 开头，没有反斜杠。
 * 其他值（完整地址、协议相对地址等）返回 undefined，防止开放重定向。
 */
export function sameOriginPath(value: string | undefined): string | undefined {
	const isPath =
		value?.startsWith("/") === true &&
		!value.startsWith("//") &&
		!value.includes("\\");
	return isPath ? value : undefined;
}

/** Casdoor 登录入口加上登录后跳转的路径。服务端会再检查一次是否同源。 */
export function casdoorLoginHref(
	loginUrl: string,
	redirectTo: string | undefined
): string {
	const path = sameOriginPath(redirectTo);
	if (path === undefined) {
		return loginUrl;
	}
	const url = new URL(loginUrl);
	url.searchParams.set(LOGIN_REDIRECT_PARAM, path);
	return url.href;
}

/** 登录页 authError 参数对应的提示。没有参数时返回 null。 */
export function casdoorLoginErrorMessage(
	code: string | undefined
): string | null {
	if (code === undefined || code === "") {
		return null;
	}
	return isCasdoorLoginErrorCode(code)
		? CASDOOR_LOGIN_ERROR_MESSAGES[code]
		: CASDOOR_LOGIN_GENERIC_ERROR;
}
