import { describe, expect, it } from "vitest";

import { loginDescriptionOf, loginMethodsOf } from "./login-methods";

const CASDOOR_URL = "/api/auth/casdoor/login";

const PASSWORD_ONLY = {
	casdoorLoginUrl: null,
	emergencyOnly: false,
	none: false,
	password: true,
};

function casdoorConfig(
	casdoorLoginUrl: string | null,
	localLoginEnabled: boolean
) {
	return { casdoorLoginUrl, localLoginEnabled, provider: "casdoor" as const };
}

describe("loginMethodsOf", () => {
	it("还没有读到配置：显示用户名密码表单", () => {
		expect(loginMethodsOf(undefined)).toEqual(PASSWORD_ONLY);
	});

	it("local 模式：只有用户名密码表单", () => {
		expect(
			loginMethodsOf({
				casdoorLoginUrl: null,
				localLoginEnabled: true,
				provider: "local",
			})
		).toEqual(PASSWORD_ONLY);
	});

	it("casdoor 模式并保留应急登录：两种都显示，密码表单只用于本地管理员应急登录", () => {
		const methods = loginMethodsOf(casdoorConfig(CASDOOR_URL, true));
		expect(methods).toEqual({
			...PASSWORD_ONLY,
			casdoorLoginUrl: CASDOOR_URL,
			emergencyOnly: true,
		});
		expect(loginDescriptionOf(methods)).toContain("应急登录");
	});

	it("casdoor 模式并关闭本地登录：只有 Casdoor 按钮", () => {
		const methods = loginMethodsOf(casdoorConfig(CASDOOR_URL, false));
		expect(methods).toEqual({
			...PASSWORD_ONLY,
			casdoorLoginUrl: CASDOOR_URL,
			password: false,
		});
		expect(loginDescriptionOf(methods)).toBe("使用 Casdoor 账号登录。");
	});

	it("没有任何登录方式：none 为 true", () => {
		const methods = loginMethodsOf(casdoorConfig(null, false));
		expect(methods.none).toBe(true);
		expect(loginDescriptionOf(methods)).toContain("没有可用的登录方式");
	});
});
