import type { AuthProvider } from "./types";

/** local 模式：只有本地密码登录，所有本地账号都可以使用。 */
export const localProvider: AuthProvider = {
	id: "local",
	localLoginPolicy: () => "all-local-accounts",
	loginUrl: () => null,
};
