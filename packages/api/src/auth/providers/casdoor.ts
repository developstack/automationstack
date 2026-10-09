import { connectionFromSettings } from "../casdoor/connection";
import { CASDOOR_LOGIN_PATH } from "../casdoor-paths";
import type { AuthProvider } from "./types";

/**
 * casdoor 模式。浏览器从 /api/auth/casdoor/login 跳转到 Casdoor 登录。
 * 登录入口与回调地址同源：回调地址指向本系统的 server。
 * 本地密码登录只作为应急登录：只有本地管理员可以使用，
 * 并且由环境变量 AUTH_ALLOW_LOCAL_LOGIN 控制（plan 021 D7）。
 */
export const casdoorProvider: AuthProvider = {
	id: "casdoor",
	localLoginPolicy: (settings) =>
		settings.allowLocalLogin ? "local-admins-only" : "disabled",
	loginUrl: (settings) => {
		const connection = connectionFromSettings(settings);
		return connection === null
			? null
			: new URL(CASDOOR_LOGIN_PATH, connection.redirectUrl).href;
	},
};
