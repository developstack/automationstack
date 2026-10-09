import { describe, expect, it } from "vitest";

import { loginDescriptionOf, loginMethodsOf } from "./login-methods";

const CASDOOR_URL = "/api/auth/casdoor/login";

describe("loginMethodsOf", () => {
	it("还没有读到配置：显示用户名密码表单", () => {
		expect(loginMethodsOf(undefined)).toEqual({
			casdoorLoginUrl: null,
			none: false,
			password: true,
		});
	});

	it("local 模式：只有用户名密码表单", () => {
		expect(
			loginMethodsOf({
				casdoorLoginUrl: null,
				localLoginEnabled: true,
				provider: "local",
			})
		).toEqual({ casdoorLoginUrl: null, none: false, password: true });
	});

	it("casdoor 模式并保留应急登录：两种都显示", () => {
		expect(
			loginMethodsOf({
				casdoorLoginUrl: CASDOOR_URL,
				localLoginEnabled: true,
				provider: "casdoor",
			})
		).toEqual({ casdoorLoginUrl: CASDOOR_URL, none: false, password: true });
	});

	it("casdoor 模式并关闭本地登录：只有 Casdoor 按钮", () => {
		const methods = loginMethodsOf({
			casdoorLoginUrl: CASDOOR_URL,
			localLoginEnabled: false,
			provider: "casdoor",
		});
		expect(methods).toEqual({
			casdoorLoginUrl: CASDOOR_URL,
			none: false,
			password: false,
		});
		expect(loginDescriptionOf(methods)).toBe("使用 Casdoor 账号登录。");
	});

	it("没有任何登录方式：none 为 true", () => {
		const methods = loginMethodsOf({
			casdoorLoginUrl: null,
			localLoginEnabled: false,
			provider: "casdoor",
		});
		expect(methods.none).toBe(true);
		expect(loginDescriptionOf(methods)).toContain("没有可用的登录方式");
	});
});
