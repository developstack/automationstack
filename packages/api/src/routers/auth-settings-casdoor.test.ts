import type { SaveAuthSettingsInput as SaveRowInput } from "@automationstack/db/repositories/auth-settings-repository";
import type { AuthSettingsRow } from "@automationstack/db/schema/auth-settings";
import type { User } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAuthSettingsCache } from "../auth/settings-store";
import { authSettingsRouter } from "./auth-settings";

const MASTER_KEY = btoa("k".repeat(32));
const CLIENT_SECRET = "client-secret-value-0001";
const INTERNAL_URL = "http://casdoor.internal:8000";

const mocks = vi.hoisted(() => ({
	countLocalLoginAdmins: vi.fn(),
	env: {} as Record<string, unknown>,
	getAuthSettingsRow: vi.fn(),
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
	getUserById: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: vi.fn(),
}));
vi.mock("../auth/casdoor/test-connection", () => ({
	testCasdoorConnection: mocks.testCasdoorConnection,
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

function steps(failedId: string | null) {
	return ["discovery", "token", "organization", "adminRole"].map((id) => ({
		detail: id === failedId ? "失败原因" : null,
		id,
		label: id,
		status: id === failedId ? "failed" : "passed",
	}));
}

let storedRow: AuthSettingsRow | null = null;

const context = {
	actor: { clientId: "t", name: "admin" },
	cookies: [] as string[],
	secure: false,
	user: admin,
};

function casdoorInput(overrides: Record<string, unknown> = {}) {
	return {
		adminRole: "automationstack-admin",
		clientId: "client-id",
		clientSecret: { kind: "set", value: CLIENT_SECRET },
		issuer: "https://casdoor.example.com",
		organization: "automationstack",
		provider: "casdoor",
		redirectUrl: "https://testcase.example.com/api/auth/casdoor/callback",
		webhookSecret: { kind: "keep" },
		...overrides,
	};
}

function save(input: Record<string, unknown>) {
	return call(authSettingsRouter.save, input as never, {
		context,
		path: ["authSettings", "save"],
	});
}

function testConnection(input: Record<string, unknown>, user: User = admin) {
	return call(authSettingsRouter.testConnection, input as never, {
		context: { ...context, user },
		path: ["authSettings", "testConnection"],
	});
}

function storeRow(values: SaveRowInput["values"]): AuthSettingsRow {
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
		updatedBy: admin.id,
	} as AuthSettingsRow;
	return storedRow;
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
		CASDOOR_INTERNAL_URL: INTERNAL_URL,
		NODE_ENV: "development",
		SECRET_ENCRYPTION_KEY: MASTER_KEY,
	});
	vi.clearAllMocks();
	mocks.getAuthSettingsRow.mockImplementation(() => Promise.resolve(storedRow));
	mocks.saveAuthSettings.mockImplementation((input: SaveRowInput) =>
		Promise.resolve(storeRow(input.values))
	);
	mocks.countLocalLoginAdmins.mockResolvedValue(1);
	mocks.testCasdoorConnection.mockResolvedValue({
		ok: true,
		steps: steps(null),
	});
});

describe("authSettings.save：切换到 Casdoor（§10.5）", () => {
	it("测试连接全部通过：保存，并记录测试成功的时间", async () => {
		await expect(save(casdoorInput())).resolves.toMatchObject({
			provider: "casdoor",
			source: "database",
		});
		expect(mocks.testCasdoorConnection).toHaveBeenCalledWith(
			expect.objectContaining({
				clientSecret: CLIENT_SECRET,
				internalUrl: INTERNAL_URL,
			})
		);
		const saved = mocks.saveAuthSettings.mock.calls[0]?.[0] as SaveRowInput;
		expect(saved.values.lastTestOkAt).toBeInstanceOf(Date);
	});

	it("任何一步失败：CONNECTION_TEST_FAILED，data 中有各步结果，不保存", async () => {
		mocks.testCasdoorConnection.mockResolvedValue({
			ok: false,
			steps: steps("token"),
		});
		await expect(save(casdoorInput())).rejects.toMatchObject({
			code: "CONNECTION_TEST_FAILED",
			data: {
				ok: false,
				steps: expect.arrayContaining([
					expect.objectContaining({ id: "token", status: "failed" }),
				]),
			},
		});
		expect(mocks.saveAuthSettings).not.toHaveBeenCalled();
	});

	it("AUTH_ALLOW_LOCAL_LOGIN=false：PRECONDITION_FAILED，不测试，不保存", async () => {
		mocks.env.AUTH_ALLOW_LOCAL_LOGIN = false;
		await expect(save(casdoorInput())).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: expect.stringContaining("AUTH_ALLOW_LOCAL_LOGIN"),
		});
		expect(mocks.testCasdoorConnection).not.toHaveBeenCalled();
		expect(mocks.saveAuthSettings).not.toHaveBeenCalled();
	});

	it("没有可以本地登录的管理员：PRECONDITION_FAILED，不保存", async () => {
		mocks.countLocalLoginAdmins.mockResolvedValue(0);
		await expect(save(casdoorInput())).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: expect.stringContaining("本地管理员"),
		});
		expect(mocks.saveAuthSettings).not.toHaveBeenCalled();
	});

	it("没有集群内地址：BAD_REQUEST，写明缺少的字段", async () => {
		mocks.env.CASDOOR_INTERNAL_URL = undefined;
		await expect(save(casdoorInput())).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("集群内地址"),
		});
		expect(mocks.testCasdoorConnection).not.toHaveBeenCalled();
	});

	it("生产环境中公网地址是 http：BAD_REQUEST，不测试", async () => {
		mocks.env.NODE_ENV = "production";
		await expect(
			save(casdoorInput({ issuer: "http://casdoor.example.com" }))
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.testCasdoorConnection).not.toHaveBeenCalled();
	});

	it("Casdoor 模式下再次保存并保留 secret：用已保存的 secret 测试", async () => {
		await save(casdoorInput());
		mocks.testCasdoorConnection.mockClear();
		await save(casdoorInput({ clientSecret: { kind: "keep" } }));
		expect(mocks.testCasdoorConnection).toHaveBeenCalledWith(
			expect.objectContaining({ clientSecret: CLIENT_SECRET })
		);
	});

	it("从 Casdoor 改回 local：不测试连接", async () => {
		await save(casdoorInput());
		mocks.testCasdoorConnection.mockClear();
		await expect(
			save(casdoorInput({ provider: "local" }))
		).resolves.toMatchObject({ provider: "local" });
		expect(mocks.testCasdoorConnection).not.toHaveBeenCalled();
	});
});

describe("authSettings.testConnection", () => {
	const form = () => {
		const {
			provider: _p,
			redirectUrl: _r,
			webhookSecret: _w,
			...rest
		} = casdoorInput();
		return rest;
	};

	it("非管理员：FORBIDDEN", async () => {
		await expect(
			testConnection(form(), { ...admin, role: "member" })
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("返回各步结果；测试的是未保存的值时，不更新最后测试成功的时间", async () => {
		await expect(testConnection(form())).resolves.toMatchObject({
			ok: true,
			steps: steps(null),
		});
		expect(mocks.markAuthSettingsTestOk).not.toHaveBeenCalled();
	});

	it("测试的值等于已保存的值并且全部通过：更新最后测试成功的时间", async () => {
		await save(casdoorInput());
		await testConnection({ ...form(), clientSecret: { kind: "keep" } });
		expect(mocks.markAuthSettingsTestOk).toHaveBeenCalledTimes(1);
	});

	it("公网地址带路径：BAD_REQUEST", async () => {
		await expect(
			testConnection({ ...form(), issuer: "https://casdoor.example.com/x" })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
