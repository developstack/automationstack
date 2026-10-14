import type { SaveAuthSettingsInput as SaveRowInput } from "@automationstack/db/repositories/auth-settings-repository";
import type { AuthSettingsRow } from "@automationstack/db/schema/auth-settings";
import { decryptSecret } from "@automationstack/db/secret-box";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAuthSettingsCache } from "../auth/settings-store";
import { callContext, testUser } from "../test-fixtures";
import { authSettingsRouter } from "./auth-settings";

const MASTER_KEY = btoa("k".repeat(32));
const CLIENT_SECRET = "client-secret-value-0001";
const WEBHOOK_SECRET = "webhook-secret-value-0123456789abcdef";
const ENV_CLIENT_SECRET = "env-client-secret-value";

const mocks = vi.hoisted(() => ({
	countLocalLoginAdmins: vi.fn(),
	env: {} as Record<string, unknown>,
	getAuthSettingsRow: vi.fn(),
	getUserById: vi.fn(),
	markAuthSettingsTestOk: vi.fn(),
	saveAuthSettings: vi.fn(),
	testCasdoorConnection: vi.fn(),
}));

vi.mock("@automationstack/env/server", () => ({ env: mocks.env }));
vi.mock("@automationstack/db/repositories/auth-settings-repository", () => ({
	getAuthSettingsRow: mocks.getAuthSettingsRow,
	getAuthSettingsUpdatedAt: vi.fn(),
	markAuthSettingsTestOk: mocks.markAuthSettingsTestOk,
	saveAuthSettings: mocks.saveAuthSettings,
}));
vi.mock("@automationstack/db/repositories/users-repository", () => ({
	countLocalLoginAdmins: mocks.countLocalLoginAdmins,
	getUserById: mocks.getUserById,
}));
vi.mock("../auth/casdoor/test-connection", () => ({
	testCasdoorConnection: mocks.testCasdoorConnection,
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: vi.fn(),
}));

const admin = testUser();

const STEP_IDS = ["discovery", "token", "organization", "adminRole"] as const;

const PASSED = {
	ok: true,
	steps: STEP_IDS.map((id) => ({
		detail: null,
		id,
		label: id,
		status: "passed",
	})),
};

let storedRow: AuthSettingsRow | null = null;

function baseInput(): Record<string, unknown> {
	return {
		adminRole: "automationstack-admin",
		clientId: "automationstack",
		clientSecret: { kind: "keep" },
		issuer: "https://casdoor.example.com/",
		organization: "automationstack",
		projectAdminRole: "automationstack-project-admin",
		provider: "local",
		redirectUrl: "https://testcase.example.com/api/auth/casdoor/callback",
		webhookSecret: { kind: "keep" },
	};
}

function save(overrides: Record<string, unknown> = {}, user = admin) {
	return call(
		authSettingsRouter.save,
		{ ...baseInput(), ...overrides } as never,
		{ context: callContext(user), path: ["authSettings", "save"] }
	);
}

function get(user = admin) {
	return call(authSettingsRouter.get, undefined, {
		context: callContext(user),
		path: ["authSettings", "get"],
	});
}

function savedRowInput(index = 0): SaveRowInput {
	return mocks.saveAuthSettings.mock.calls[index]?.[0] as SaveRowInput;
}

beforeEach(() => {
	invalidateAuthSettingsCache();
	storedRow = null;
	for (const key of Object.keys(mocks.env)) {
		delete mocks.env[key];
	}
	Object.assign(mocks.env, {
		AUTH_ALLOW_LOCAL_LOGIN: true,
		AUTH_PROVIDER: "local",
		NODE_ENV: "development",
		SECRET_ENCRYPTION_KEY: MASTER_KEY,
	});
	mocks.getAuthSettingsRow.mockReset();
	mocks.getAuthSettingsRow.mockImplementation(() => Promise.resolve(storedRow));
	mocks.getUserById.mockReset();
	mocks.getUserById.mockResolvedValue(admin);
	mocks.countLocalLoginAdmins.mockReset();
	mocks.countLocalLoginAdmins.mockResolvedValue(1);
	mocks.markAuthSettingsTestOk.mockReset();
	mocks.testCasdoorConnection.mockReset();
	mocks.testCasdoorConnection.mockResolvedValue(PASSED);
	mocks.saveAuthSettings.mockReset();
	mocks.saveAuthSettings.mockImplementation((input: SaveRowInput) => {
		const { values } = input;
		storedRow = {
			clientSecretCipher: null,
			id: 1,
			lastTestOkAt: null,
			webhookSecretCipher: null,
			...storedRow,
			...Object.fromEntries(
				Object.entries(values).filter(([, value]) => value !== undefined)
			),
			updatedAt: new Date(),
			updatedBy: input.actorId,
		} as AuthSettingsRow;
		return Promise.resolve(storedRow);
	});
});

describe("authSettings：权限", () => {
	const member = testUser({ role: "member" });

	it("非管理员调用 get：FORBIDDEN", async () => {
		await expect(get(member)).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("非管理员调用 save：FORBIDDEN，不写数据库", async () => {
		await expect(save({}, member)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mocks.saveAuthSettings).not.toHaveBeenCalled();
	});
});

describe("authSettings.get", () => {
	it("没有保存过：来源为环境变量，密钥只返回是否已设置", async () => {
		mocks.env.CASDOOR_CLIENT_SECRET = ENV_CLIENT_SECRET;
		mocks.env.CASDOOR_INTERNAL_URL = "http://casdoor.internal:8000";
		const view = await get();
		expect(view).toMatchObject({
			hasClientSecret: true,
			hasWebhookSecret: false,
			internalUrl: "http://casdoor.internal:8000",
			provider: "local",
			secretStorageAvailable: true,
			source: "env",
		});
		expect(JSON.stringify(view)).not.toContain(ENV_CLIENT_SECRET);
	});

	it("保存过密钥：get 的结果不包含密钥的值，也不包含密文", async () => {
		await save({
			clientSecret: { kind: "set", value: CLIENT_SECRET },
			webhookSecret: { kind: "set", value: WEBHOOK_SECRET },
		});
		const text = JSON.stringify(await get());
		expect(text).not.toContain(CLIENT_SECRET);
		expect(text).not.toContain(WEBHOOK_SECRET);
		expect(text).not.toContain(storedRow?.clientSecretCipher ?? "missing");
	});

	it("没有主密钥：secretStorageAvailable 为 false", async () => {
		mocks.env.SECRET_ENCRYPTION_KEY = undefined;
		await expect(get()).resolves.toMatchObject({
			secretStorageAvailable: false,
		});
	});
});

describe("authSettings.save：校验", () => {
	it.each([
		["组织为 built-in", { organization: "built-in" }, "development"],
		[
			"公网地址带路径",
			{ issuer: "https://casdoor.example.com/login" },
			"development",
		],
		[
			"生产环境中公网地址不是 https",
			{ issuer: "http://casdoor.example.com" },
			"production",
		],
		[
			"回调地址不以 /api/auth/casdoor/callback 结尾",
			{ redirectUrl: "https://testcase.example.com/callback" },
			"development",
		],
		[
			"Webhook 密钥少于 32 个字符",
			{ webhookSecret: { kind: "set", value: "short" } },
			"development",
		],
	])("%s：BAD_REQUEST，不写数据库", async (_name, overrides, nodeEnv) => {
		mocks.env.NODE_ENV = nodeEnv;
		await expect(save(overrides)).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(mocks.saveAuthSettings).not.toHaveBeenCalled();
	});

	it("公网地址规范为 origin（去掉结尾的斜杠）", async () => {
		await save();
		expect(savedRowInput().values.issuer).toBe("https://casdoor.example.com");
	});
});

describe("authSettings.save：主密钥", () => {
	it("没有主密钥时设置密钥：PRECONDITION_FAILED，不写数据库", async () => {
		mocks.env.SECRET_ENCRYPTION_KEY = undefined;
		await expect(
			save({ clientSecret: { kind: "set", value: CLIENT_SECRET } })
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(mocks.saveAuthSettings).not.toHaveBeenCalled();
	});

	it("没有主密钥时只修改普通字段：可以保存", async () => {
		mocks.env.SECRET_ENCRYPTION_KEY = undefined;
		await expect(save()).resolves.toMatchObject({ source: "database" });
	});

	it("保存后立即生效：get 返回页面配置和保存人", async () => {
		await save({ clientSecret: { kind: "set", value: CLIENT_SECRET } });
		const cipher = storedRow?.clientSecretCipher ?? "";
		await expect(decryptSecret(cipher, MASTER_KEY)).resolves.toEqual({
			kind: "ok",
			value: CLIENT_SECRET,
		});
		await expect(get()).resolves.toMatchObject({
			clientId: "automationstack",
			hasClientSecret: true,
			source: "database",
			updatedByUsername: "admin",
		});
	});
});
