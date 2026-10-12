import type { AuthSettingsRow } from "@automationstack/db/schema/auth-settings";
import { encryptSecret } from "@automationstack/db/secret-box";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	getEffectiveAuthSettings,
	invalidateAuthSettingsCache,
	RECHECK_INTERVAL_MS,
} from "./settings-store";

const MASTER_KEY = btoa("k".repeat(32));
const OTHER_KEY = btoa("o".repeat(32));

const mocks = vi.hoisted(() => ({
	env: {} as Record<string, unknown>,
	getAuthSettingsRow: vi.fn(),
	getAuthSettingsUpdatedAt: vi.fn(),
}));

vi.mock("@automationstack/env/server", () => ({ env: mocks.env }));
vi.mock("@automationstack/db/repositories/auth-settings-repository", () => ({
	getAuthSettingsRow: mocks.getAuthSettingsRow,
	getAuthSettingsUpdatedAt: mocks.getAuthSettingsUpdatedAt,
}));

const SAVED_AT = new Date("2026-10-01T00:00:00Z");

function row(overrides: Partial<AuthSettingsRow> = {}): AuthSettingsRow {
	return {
		adminRole: "automationstack-admin",
		clientId: "db-client",
		clientSecretCipher: null,
		id: 1,
		issuer: "https://casdoor.db.example.com",
		lastTestOkAt: null,
		organization: "db-org",
		projectAdminRole: "automationstack-project-admin",
		provider: "local",
		redirectUrl: null,
		updatedAt: SAVED_AT,
		updatedBy: null,
		webhookSecretCipher: null,
		...overrides,
	};
}

async function cipherOf(value: string, key = MASTER_KEY): Promise<string> {
	const encrypted = await encryptSecret(value, key);
	if (encrypted.kind !== "ok") {
		throw new Error("测试密钥无效");
	}
	return encrypted.box;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(SAVED_AT);
	invalidateAuthSettingsCache();
	for (const key of Object.keys(mocks.env)) {
		delete mocks.env[key];
	}
	Object.assign(mocks.env, {
		AUTH_ALLOW_LOCAL_LOGIN: true,
		AUTH_PROVIDER: "casdoor",
		CASDOOR_CLIENT_ID: "env-client",
		CASDOOR_CLIENT_SECRET: "env-client-secret",
		CASDOOR_INTERNAL_URL: "http://casdoor.casdoor.svc.cluster.local:8000",
		CASDOOR_ISSUER: "https://casdoor.env.example.com",
		SECRET_ENCRYPTION_KEY: MASTER_KEY,
	});
	mocks.getAuthSettingsRow.mockReset();
	mocks.getAuthSettingsUpdatedAt.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("settings-store：来源", () => {
	it("数据库中没有行：取环境变量，来源为 env", async () => {
		mocks.getAuthSettingsRow.mockResolvedValue(null);
		await expect(getEffectiveAuthSettings()).resolves.toMatchObject({
			clientId: "env-client",
			clientSecret: { present: true, value: "env-client-secret" },
			issuer: "https://casdoor.env.example.com",
			provider: "casdoor",
			source: "env",
		});
	});

	it("数据库中有行：整行优先，不逐项回退到环境变量", async () => {
		mocks.getAuthSettingsRow.mockResolvedValue(row());
		const settings = await getEffectiveAuthSettings();
		expect(settings).toMatchObject({
			clientId: "db-client",
			clientSecret: { present: false, value: null },
			issuer: "https://casdoor.db.example.com",
			provider: "local",
			redirectUrl: null,
			source: "database",
		});
	});

	it("项目管理员角色名：没有行时取环境变量，有行时取行的值（#15）", async () => {
		mocks.env.CASDOOR_PROJECT_ADMIN_ROLE = "env-project-admin";
		mocks.getAuthSettingsRow.mockResolvedValue(null);
		await expect(getEffectiveAuthSettings()).resolves.toMatchObject({
			projectAdminRole: "env-project-admin",
		});
		invalidateAuthSettingsCache();
		mocks.getAuthSettingsRow.mockResolvedValue(
			row({ projectAdminRole: "db-project-admin" })
		);
		await expect(getEffectiveAuthSettings()).resolves.toMatchObject({
			projectAdminRole: "db-project-admin",
		});
	});

	it("集群内地址和应急登录开关总是取环境变量", async () => {
		mocks.env.AUTH_ALLOW_LOCAL_LOGIN = false;
		mocks.getAuthSettingsRow.mockResolvedValue(row());
		await expect(getEffectiveAuthSettings()).resolves.toMatchObject({
			allowLocalLogin: false,
			internalUrl: "http://casdoor.casdoor.svc.cluster.local:8000",
		});
	});

	it("数据库中的密钥用主密钥解密", async () => {
		mocks.getAuthSettingsRow.mockResolvedValue(
			row({ clientSecretCipher: await cipherOf("db-client-secret") })
		);
		await expect(getEffectiveAuthSettings()).resolves.toMatchObject({
			clientSecret: { present: true, value: "db-client-secret" },
			credentialProblem: null,
		});
	});

	it("没有主密钥：密钥标为已设置但不可用，credentialProblem 为 master-key-missing", async () => {
		mocks.env.SECRET_ENCRYPTION_KEY = undefined;
		mocks.getAuthSettingsRow.mockResolvedValue(
			row({ webhookSecretCipher: await cipherOf("w".repeat(40)) })
		);
		await expect(getEffectiveAuthSettings()).resolves.toMatchObject({
			credentialProblem: "master-key-missing",
			webhookSecret: { present: true, value: null },
		});
	});

	it("主密钥换过：credentialProblem 为 undecryptable", async () => {
		mocks.getAuthSettingsRow.mockResolvedValue(
			row({ clientSecretCipher: await cipherOf("secret", OTHER_KEY) })
		);
		await expect(getEffectiveAuthSettings()).resolves.toMatchObject({
			clientSecret: { present: true, value: null },
			credentialProblem: "undecryptable",
		});
	});
});

describe("settings-store：缓存", () => {
	it("30 秒内重复读取不查询数据库", async () => {
		mocks.getAuthSettingsRow.mockResolvedValue(row());
		await getEffectiveAuthSettings();
		await getEffectiveAuthSettings();
		expect(mocks.getAuthSettingsRow).toHaveBeenCalledTimes(1);
		expect(mocks.getAuthSettingsUpdatedAt).not.toHaveBeenCalled();
	});

	it("invalidate 后立即重新读取", async () => {
		mocks.getAuthSettingsRow.mockResolvedValueOnce(null);
		expect((await getEffectiveAuthSettings()).source).toBe("env");
		mocks.getAuthSettingsRow.mockResolvedValueOnce(row());
		invalidateAuthSettingsCache();
		expect((await getEffectiveAuthSettings()).source).toBe("database");
	});

	it("30 秒后 updated_at 没有变化：继续使用缓存", async () => {
		mocks.getAuthSettingsRow.mockResolvedValue(row());
		await getEffectiveAuthSettings();
		vi.advanceTimersByTime(RECHECK_INTERVAL_MS);
		mocks.getAuthSettingsUpdatedAt.mockResolvedValue(new Date(SAVED_AT));
		await getEffectiveAuthSettings();
		expect(mocks.getAuthSettingsUpdatedAt).toHaveBeenCalledTimes(1);
		expect(mocks.getAuthSettingsRow).toHaveBeenCalledTimes(1);
	});

	it("30 秒后 updated_at 变化：重新读取", async () => {
		mocks.getAuthSettingsRow.mockResolvedValueOnce(row());
		await getEffectiveAuthSettings();
		vi.advanceTimersByTime(RECHECK_INTERVAL_MS);
		const later = new Date(SAVED_AT.getTime() + RECHECK_INTERVAL_MS);
		mocks.getAuthSettingsUpdatedAt.mockResolvedValue(later);
		mocks.getAuthSettingsRow.mockResolvedValueOnce(
			row({ clientId: "changed", updatedAt: later })
		);
		expect((await getEffectiveAuthSettings()).clientId).toBe("changed");
	});

	it("30 秒后另一个副本第一次保存（来源从 env 变为 database）：重新读取", async () => {
		mocks.getAuthSettingsRow.mockResolvedValueOnce(null);
		await getEffectiveAuthSettings();
		vi.advanceTimersByTime(RECHECK_INTERVAL_MS);
		mocks.getAuthSettingsUpdatedAt.mockResolvedValue(SAVED_AT);
		mocks.getAuthSettingsRow.mockResolvedValueOnce(row());
		expect((await getEffectiveAuthSettings()).source).toBe("database");
	});

	it("读取期间缓存失效：旧结果不写入缓存", async () => {
		let release: (value: AuthSettingsRow | null) => void = () => undefined;
		mocks.getAuthSettingsRow.mockReturnValueOnce(
			new Promise((resolve) => {
				release = resolve;
			})
		);
		const first = getEffectiveAuthSettings();
		invalidateAuthSettingsCache();
		release(null);
		await first;
		mocks.getAuthSettingsRow.mockResolvedValueOnce(row());
		expect((await getEffectiveAuthSettings()).source).toBe("database");
	});
});
