import type { SaveAuthSettingsInput as SaveRowInput } from "@automationstack/db/repositories/auth-settings-repository";
import type { AuthSettingsRow } from "@automationstack/db/schema/auth-settings";
import type { User } from "@automationstack/db/schema/users";
import { decryptSecret } from "@automationstack/db/secret-box";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAuthSettingsCache } from "../auth/settings-store";
import { authSettingsRouter } from "./auth-settings";

const MASTER_KEY = btoa("k".repeat(32));
const CLIENT_SECRET = "client-secret-value-0001";
const WEBHOOK_SECRET = "webhook-secret-value-0123456789abcdef";
const ENV_CLIENT_SECRET = "env-client-secret-value";

const mocks = vi.hoisted(() => ({
	env: {} as Record<string, unknown>,
	getAuthSettingsRow: vi.fn(),
	getUserById: vi.fn(),
	saveAuthSettings: vi.fn(),
}));

vi.mock("@automationstack/env/server", () => ({ env: mocks.env }));
vi.mock("@automationstack/db/repositories/auth-settings-repository", () => ({
	getAuthSettingsRow: mocks.getAuthSettingsRow,
	getAuthSettingsUpdatedAt: vi.fn(),
	saveAuthSettings: mocks.saveAuthSettings,
}));
vi.mock("@automationstack/db/repositories/users-repository", () => ({
	getUserById: mocks.getUserById,
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: vi.fn(),
}));

const admin: User = {
	authSource: "local",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	disabledAt: null,
	externalId: null,
	id: "22222222-2222-4222-8222-222222222222",
	mustChangePassword: false,
	passwordHash: "hash",
	role: "admin",
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	username: "admin",
};

let storedRow: AuthSettingsRow | null = null;

function contextFor(user: User) {
	return {
		actor: { clientId: "t", name: user.username },
		cookies: [] as string[],
		secure: false,
		user,
	};
}

function baseInput(): Record<string, unknown> {
	return {
		adminRole: "automationstack-admin",
		clientId: "automationstack",
		clientSecret: { kind: "keep" },
		issuer: "https://casdoor.example.com/",
		organization: "automationstack",
		provider: "local",
		redirectUrl: "https://testcase.example.com/api/auth/casdoor/callback",
		webhookSecret: { kind: "keep" },
	};
}

function save(overrides: Record<string, unknown> = {}, user = admin) {
	return call(
		authSettingsRouter.save,
		{ ...baseInput(), ...overrides } as never,
		{ context: contextFor(user), path: ["authSettings", "save"] }
	);
}

function get(user = admin) {
	return call(authSettingsRouter.get, undefined, {
		context: contextFor(user),
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
	const member: User = { ...admin, role: "member" };

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
	it("阶段 2 拒绝 provider = casdoor", async () => {
		await expect(save({ provider: "casdoor" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("Casdoor 模式尚未实现"),
		});
		expect(mocks.saveAuthSettings).not.toHaveBeenCalled();
	});

	it("组织为 built-in：BAD_REQUEST", async () => {
		await expect(save({ organization: "built-in" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("公网地址带路径：BAD_REQUEST", async () => {
		await expect(
			save({ issuer: "https://casdoor.example.com/login" })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("生产环境中公网地址不是 https：BAD_REQUEST", async () => {
		mocks.env.NODE_ENV = "production";
		await expect(
			save({ issuer: "http://casdoor.example.com" })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("回调地址不以 /api/auth/casdoor/callback 结尾：BAD_REQUEST", async () => {
		await expect(
			save({ redirectUrl: "https://testcase.example.com/callback" })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("Webhook 密钥少于 32 个字符：BAD_REQUEST", async () => {
		await expect(
			save({ webhookSecret: { kind: "set", value: "short" } })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
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
