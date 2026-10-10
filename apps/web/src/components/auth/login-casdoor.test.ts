import { CASDOOR_LOGIN_ERROR_MESSAGES } from "@automationstack/api/auth/casdoor/login-errors";
import { describe, expect, it } from "vitest";

import {
	CASDOOR_LOGIN_GENERIC_ERROR,
	casdoorLoginErrorMessage,
	casdoorLoginHref,
	sameOriginPath,
} from "./login-casdoor";

const LOGIN_URL = "http://localhost:3000/api/auth/casdoor/login";

describe("sameOriginPath", () => {
	it("接受本站路径，保留查询和锚点", () => {
		expect(sameOriginPath("/projects/p1?tab=runs#top")).toBe(
			"/projects/p1?tab=runs#top"
		);
	});

	it.each([
		undefined,
		"",
		"projects",
		"//evil.example.com/x",
		"/\\evil.example.com",
		"https://evil.example.com/projects",
		"javascript:alert(1)",
	])("拒绝 %s", (value) => {
		expect(sameOriginPath(value)).toBeUndefined();
	});
});

describe("casdoorLoginHref", () => {
	it("加上 redirect 参数，并做编码", () => {
		const href = casdoorLoginHref(LOGIN_URL, "/projects/p1?tab=runs&x=1");
		const url = new URL(href);
		expect(`${url.origin}${url.pathname}`).toBe(LOGIN_URL);
		expect(url.searchParams.get("redirect")).toBe("/projects/p1?tab=runs&x=1");
	});

	it("没有 redirect 或 redirect 不是本站路径：使用原地址", () => {
		expect(casdoorLoginHref(LOGIN_URL, undefined)).toBe(LOGIN_URL);
		expect(casdoorLoginHref(LOGIN_URL, "https://evil.example.com")).toBe(
			LOGIN_URL
		);
	});
});

describe("casdoorLoginErrorMessage", () => {
	it("没有错误码：null", () => {
		expect(casdoorLoginErrorMessage(undefined)).toBeNull();
		expect(casdoorLoginErrorMessage("")).toBeNull();
	});

	it("已知错误码：使用服务端定义的提示", () => {
		expect(casdoorLoginErrorMessage("account-disabled")).toBe(
			CASDOOR_LOGIN_ERROR_MESSAGES["account-disabled"]
		);
		expect(casdoorLoginErrorMessage("settings-changed")).toBe(
			CASDOOR_LOGIN_ERROR_MESSAGES["settings-changed"]
		);
	});

	it("不认识的错误码（包括原型上的属性名）：通用提示", () => {
		expect(casdoorLoginErrorMessage("no-such-code")).toBe(
			CASDOOR_LOGIN_GENERIC_ERROR
		);
		expect(casdoorLoginErrorMessage("toString")).toBe(
			CASDOOR_LOGIN_GENERIC_ERROR
		);
	});
});
