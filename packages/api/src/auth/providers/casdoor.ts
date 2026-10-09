import type { AuthProvider } from "./types";

/**
 * casdoor 模式。Casdoor 登录在阶段 3 实现，现在没有登录入口。
 * 本地密码登录只作为应急登录：只有本地管理员可以使用，
 * 并且由环境变量 AUTH_ALLOW_LOCAL_LOGIN 控制（plan 021 D7）。
 */
export const casdoorProvider: AuthProvider = {
	id: "casdoor",
	localLoginPolicy: (settings) =>
		settings.allowLocalLogin ? "local-admins-only" : "disabled",
	loginUrl: () => null,
};
