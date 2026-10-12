import { describe, expect, it } from "vitest";

import {
	checkAuthSettingsInput,
	type SaveAuthSettingsInput,
	saveAuthSettingsSchema,
} from "./settings-input";

function input(
	overrides: Partial<SaveAuthSettingsInput> = {}
): SaveAuthSettingsInput {
	return {
		adminRole: "automationstack-admin",
		clientId: "automationstack",
		clientSecret: { kind: "keep" },
		issuer: "https://casdoor.example.com",
		organization: "automationstack",
		projectAdminRole: "automationstack-project-admin",
		provider: "local",
		redirectUrl: "https://testcase.example.com/api/auth/casdoor/callback",
		webhookSecret: { kind: "keep" },
		...overrides,
	};
}

const development = { production: false };
const production = { production: true };

describe("checkAuthSettingsInput：公网地址（D11）", () => {
	it.each([
		"https://casdoor.example.com",
		"https://casdoor.example.com/",
		"http://casdoor.example.com:8000",
	])("%s：接受，并规范为 origin", (issuer) => {
		const checked = checkAuthSettingsInput(input({ issuer }), development);
		expect(checked).toMatchObject({ kind: "ok" });
		if (checked.kind === "ok") {
			expect(checked.input.issuer).toBe(new URL(issuer).origin);
		}
	});

	it.each([
		"https://casdoor.example.com/login",
		"https://casdoor.example.com?x=1",
		"https://user:pass@casdoor.example.com",
		"ftp://casdoor.example.com",
		"casdoor.example.com",
	])("%s：拒绝", (issuer) => {
		expect(checkAuthSettingsInput(input({ issuer }), development).kind).toBe(
			"invalid"
		);
	});

	it("生产环境中必须是 https", () => {
		expect(
			checkAuthSettingsInput(
				input({ issuer: "http://casdoor.example.com" }),
				production
			).kind
		).toBe("invalid");
	});

	it("没有填写：接受", () => {
		expect(
			checkAuthSettingsInput(input({ issuer: null }), production).kind
		).toBe("ok");
	});
});

describe("checkAuthSettingsInput：其他字段", () => {
	it.each(["built-in", "Built-In"])("组织为 %s：拒绝", (organization) => {
		expect(
			checkAuthSettingsInput(input({ organization }), development).kind
		).toBe("invalid");
	});

	it.each([
		"https://testcase.example.com/callback",
		"https://testcase.example.com/api/auth/casdoor/callback?next=1",
		"not a url",
	])("回调地址 %s：拒绝", (redirectUrl) => {
		expect(
			checkAuthSettingsInput(input({ redirectUrl }), development).kind
		).toBe("invalid");
	});

	it("Casdoor 模式下清空 Client Secret：拒绝", () => {
		expect(
			checkAuthSettingsInput(
				input({ clientSecret: { kind: "clear" }, provider: "casdoor" }),
				development
			)
		).toMatchObject({
			kind: "invalid",
			message: expect.stringContaining("Client Secret"),
		});
	});

	it("本地模式下清空 Client Secret：接受", () => {
		expect(
			checkAuthSettingsInput(
				input({ clientSecret: { kind: "clear" } }),
				development
			).kind
		).toBe("ok");
	});
});

describe("saveAuthSettingsSchema", () => {
	it("空字符串保存为 null", () => {
		const parsed = saveAuthSettingsSchema.parse({
			...input(),
			adminRole: "  ",
			clientId: "",
			projectAdminRole: " ",
		});
		expect(parsed.adminRole).toBeNull();
		expect(parsed.projectAdminRole).toBeNull();
		expect(parsed.clientId).toBeNull();
	});

	it("密钥更新只接受 keep、set、clear", () => {
		expect(
			saveAuthSettingsSchema.safeParse({
				...input(),
				clientSecret: { kind: "reveal" },
			}).success
		).toBe(false);
	});
});
