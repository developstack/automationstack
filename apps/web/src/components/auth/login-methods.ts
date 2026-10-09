import type { AuthConfig } from "@automationstack/api/auth/providers/resolve";

export interface LoginMethods {
	casdoorLoginUrl: string | null;
	/** Casdoor 模式下的用户名密码表单：只有本地管理员可以用它应急登录。 */
	emergencyOnly: boolean;
	/** 没有任何可用的登录方式。 */
	none: boolean;
	password: boolean;
}

/**
 * 登录页显示哪些登录方式。还没有读到 auth.config（加载中或读取失败）时，
 * 显示用户名密码表单：本地登录关闭时，服务端会拒绝登录。
 */
export function loginMethodsOf(config: AuthConfig | undefined): LoginMethods {
	if (config === undefined) {
		return {
			casdoorLoginUrl: null,
			emergencyOnly: false,
			none: false,
			password: true,
		};
	}
	return {
		casdoorLoginUrl: config.casdoorLoginUrl,
		emergencyOnly: config.provider === "casdoor" && config.localLoginEnabled,
		none: !config.localLoginEnabled && config.casdoorLoginUrl === null,
		password: config.localLoginEnabled,
	};
}

export function loginDescriptionOf(methods: LoginMethods): string {
	if (methods.emergencyOnly) {
		return "使用 Casdoor 账号登录。Casdoor 不可用时，本地管理员可以用应急登录。";
	}
	if (methods.password) {
		return "账号由管理员统一创建；忘记密码请联系管理员重置。";
	}
	if (methods.casdoorLoginUrl !== null) {
		return "使用 Casdoor 账号登录。";
	}
	return "当前没有可用的登录方式。请联系管理员。";
}
