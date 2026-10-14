import type { AuthSettingsView } from "@automationstack/api/auth/settings-view";
import { describe, expect, it } from "vitest";

import {
	type AuthSettingsFormValues,
	generateWebhookSecret,
	hasAuthSettingsError,
	initialAuthSettingsValues,
	toAuthSettingsSaveInput,
	validateAuthSettingsForm,
} from "./auth-settings-form-values";

const CALLBACK_PATH = "/api/auth/casdoor/callback";
const SERVER_URL = "https://testcase.example.com";
const BASE64URL = /^[A-Za-z0-9_-]+$/;

type AuthSettingsErrors = ReturnType<typeof validateAuthSettingsForm>;

const view: AuthSettingsView = {
	adminRole: null,
	allowLocalLogin: true,
	callbackPath: CALLBACK_PATH,
	casdoorSelectable: false,
	clientId: "automationstack",
	credentialProblem: null,
	hasClientSecret: true,
	hasWebhookSecret: false,
	internalUrl: null,
	issuer: "https://casdoor.example.com",
	lastTestOkAt: null,
	organization: "automationstack",
	projectAdminRole: "automationstack-project-admin",
	provider: "local",
	redirectUrl: null,
	secretStorageAvailable: true,
	source: "env",
	updatedAt: null,
	updatedByUsername: null,
	webhookPath: "/api/auth/casdoor/webhook",
};

function values(
	overrides: Partial<AuthSettingsFormValues> = {}
): AuthSettingsFormValues {
	return { ...initialAuthSettingsValues(view, SERVER_URL), ...overrides };
}

describe("initialAuthSettingsValues", () => {
	it("没有回调地址时，按 server 地址预填", () => {
		expect(values().redirectUrl).toBe(
			"https://testcase.example.com/api/auth/casdoor/callback"
		);
	});

	it("项目管理员角色名取页面数据；没有值时为空（#15）", () => {
		expect(values().projectAdminRole).toBe("automationstack-project-admin");
		expect(
			initialAuthSettingsValues({ ...view, projectAdminRole: null }, SERVER_URL)
				.projectAdminRole
		).toBe("");
	});

	it("密钥输入框总是空的", () => {
		expect(values()).toMatchObject({ clientSecret: "", webhookSecret: "" });
	});
});

describe("validateAuthSettingsForm", () => {
	it("默认值没有错误", () => {
		expect(
			hasAuthSettingsError(validateAuthSettingsForm(values(), CALLBACK_PATH))
		).toBe(false);
	});

	it.each<[string, Partial<AuthSettingsFormValues>, keyof AuthSettingsErrors]>([
		[
			"公网地址带路径：报错",
			{ issuer: "https://casdoor.example.com/login" },
			"issuer",
		],
		["组织为 built-in：报错", { organization: "built-in" }, "organization"],
		[
			"回调地址的路径不对：报错",
			{ redirectUrl: "https://testcase.example.com/callback" },
			"redirectUrl",
		],
		["Webhook 密钥太短：报错", { webhookSecret: "short" }, "webhookSecret"],
	])("%s", (_name, patch, field) => {
		expect(
			validateAuthSettingsForm(values(patch), CALLBACK_PATH)[field]
		).not.toBeNull();
	});
});

describe("toAuthSettingsSaveInput", () => {
	it.each<[string, Partial<AuthSettingsFormValues>, object]>([
		[
			"密钥输入框为空：keep",
			{},
			{ clientSecret: { kind: "keep" }, webhookSecret: { kind: "keep" } },
		],
		[
			"填写了密钥：set",
			{ clientSecret: " secret " },
			{ clientSecret: { kind: "set", value: "secret" } },
		],
		[
			"选择清空：clear",
			{ clearWebhookSecret: true },
			{ webhookSecret: { kind: "clear" } },
		],
		[
			"空字符串保存为 null",
			{ adminRole: "  ", projectAdminRole: " " },
			{ adminRole: null, projectAdminRole: null },
		],
		[
			"项目管理员角色名去掉首尾空白后保存（#15）",
			{ projectAdminRole: " pm-role " },
			{ projectAdminRole: "pm-role" },
		],
	])("%s", (_name, patch, saved) => {
		expect(toAuthSettingsSaveInput(values(patch))).toMatchObject(saved);
	});
});

describe("generateWebhookSecret", () => {
	it("生成 43 个字符的 base64url 字符串，每次不同", () => {
		const first = generateWebhookSecret();
		expect(first).toHaveLength(43);
		expect(first).toMatch(BASE64URL);
		expect(generateWebhookSecret()).not.toBe(first);
	});
});
