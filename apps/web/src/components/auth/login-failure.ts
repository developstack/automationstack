import { ORPCError } from "@orpc/client";

export const LOGIN_CREDENTIALS_ERROR = "用户名或密码错误";
export const LOGIN_NETWORK_ERROR = "无法连接服务器，请稍后重试";

const FIRST_SERVER_ERROR_STATUS = 500;

/**
 * 登录请求失败的两种显示位置：
 * - credentials：密码框下方，并标红密码框。
 * - alert：登录按钮上方的提示区，不标红输入框。
 */
export type LoginFailure =
	| { kind: "credentials"; message: string }
	| { kind: "alert"; message: string };

/**
 * 把登录请求的错误转换为页面上的提示。
 * 未授权统一提示"用户名或密码错误"。网络错误和 5xx 错误提示无法连接服务器。
 * 其他 4xx 错误（例如限流、内置认证关闭）显示服务器给出的中文提示。
 */
export function loginFailureOf(error: unknown): LoginFailure {
	if (!(error instanceof ORPCError)) {
		return { kind: "alert", message: LOGIN_NETWORK_ERROR };
	}
	if (error.code === "UNAUTHORIZED") {
		return { kind: "credentials", message: LOGIN_CREDENTIALS_ERROR };
	}
	if (error.status >= FIRST_SERVER_ERROR_STATUS) {
		return { kind: "alert", message: LOGIN_NETWORK_ERROR };
	}
	return { kind: "alert", message: error.message };
}
