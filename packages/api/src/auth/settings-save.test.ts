import type { SaveAuthSettingsInput as SaveRowInput } from "@automationstack/db/repositories/auth-settings-repository";
import type { AuthSettingsRow } from "@automationstack/db/schema/auth-settings";
import { decryptSecret, encryptSecret } from "@automationstack/db/secret-box";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveAuthSettingsInput } from "./settings-input";
import { saveEffectiveAuthSettings } from "./settings-save";
import { invalidateAuthSettingsCache } from "./settings-store";

const MASTER_KEY = btoa("k".repeat(32));
const CLIENT_SECRET = "new-client-secret-value";
const OLD_CLIENT_SECRET = "old-client-secret-value";
const WEBHOOK_SECRET = "new-webhook-secret-0123456789abcdef";
const ENV_CLIENT_SECRET = "env-client-secret-value";
const ACTOR = { id: "22222222-2222-4222-8222-222222222222", username: "admin" };

const mocks = vi.hoisted(() => ({
	env: {} as Record<string, unknown>,
	getAuthSettingsRow: vi.fn(),
	saveAuthSettings: vi.fn(),
}));

vi.mock("@automationstack/env/server", () => ({ env: mocks.env }));
vi.mock("@automationstack/db/repositories/auth-settings-repository", () => ({
	getAuthSettingsRow: mocks.getAuthSettingsRow,
	getAuthSettingsUpdatedAt: vi.fn(),
	saveAuthSettings: mocks.saveAuthSettings,
}));

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
		redirectUrl: null,
		webhookSecret: { kind: "keep" },
		...overrides,
	};
}

async function storedRow(
	overrides: Partial<AuthSettingsRow> = {}
): Promise<AuthSettingsRow> {
	const encrypted = await encryptSecret(OLD_CLIENT_SECRET, MASTER_KEY);
	return {
		adminRole: "automationstack-admin",
		clientId: "automationstack",
		clientSecretCipher: encrypted.kind === "ok" ? encrypted.box : null,
		id: 1,
		issuer: "https://casdoor.example.com",
		lastTestOkAt: new Date("2026-10-01T00:00:00Z"),
		organization: "automationstack",
		projectAdminRole: "automationstack-project-admin",
		provider: "local",
		redirectUrl: null,
		updatedAt: new Date("2026-10-01T00:00:00Z"),
		updatedBy: null,
		webhookSecretCipher: null,
		...overrides,
	};
}

function savedRow(): SaveRowInput {
	return mocks.saveAuthSettings.mock.calls[0]?.[0] as SaveRowInput;
}

async function decrypted(cipher: string | null | undefined) {
	return await decryptSecret(cipher ?? "", MASTER_KEY);
}

beforeEach(async () => {
	invalidateAuthSettingsCache();
	for (const key of Object.keys(mocks.env)) {
		delete mocks.env[key];
	}
	Object.assign(mocks.env, {
		AUTH_ALLOW_LOCAL_LOGIN: true,
		AUTH_PROVIDER: "local",
		SECRET_ENCRYPTION_KEY: MASTER_KEY,
	});
	mocks.getAuthSettingsRow.mockReset();
	mocks.saveAuthSettings.mockReset();
	mocks.saveAuthSettings.mockResolvedValue({});
	mocks.getAuthSettingsRow.mockResolvedValue(await storedRow());
});

function save(
	overrides: Partial<SaveAuthSettingsInput> = {},
	options?: Parameters<typeof saveEffectiveAuthSettings>[2]
) {
	return saveEffectiveAuthSettings(input(overrides), ACTOR, options);
}

describe("saveEffectiveAuthSettings：密钥", () => {
	it("keep：不写密钥列（undefined）", async () => {
		await save();
		expect(savedRow().values.clientSecretCipher).toBeUndefined();
		expect(savedRow().values.webhookSecretCipher).toBeUndefined();
	});

	it("set：写入密文，不写明文", async () => {
		await save({
			clientSecret: { kind: "set", value: CLIENT_SECRET },
			webhookSecret: { kind: "set", value: WEBHOOK_SECRET },
		});
		const { values } = savedRow();
		expect(JSON.stringify(values)).not.toContain(CLIENT_SECRET);
		expect(JSON.stringify(values)).not.toContain(WEBHOOK_SECRET);
		await expect(decrypted(values.clientSecretCipher)).resolves.toEqual({
			kind: "ok",
			value: CLIENT_SECRET,
		});
		await expect(decrypted(values.webhookSecretCipher)).resolves.toEqual({
			kind: "ok",
			value: WEBHOOK_SECRET,
		});
	});

	it("clear：密钥列写 null", async () => {
		await save({ clientSecret: { kind: "clear" } });
		expect(savedRow().values.clientSecretCipher).toBeNull();
	});

	it("没有主密钥时 set：master-key-missing，不写数据库", async () => {
		mocks.env.SECRET_ENCRYPTION_KEY = undefined;
		mocks.getAuthSettingsRow.mockResolvedValue(null);
		await expect(
			save({ webhookSecret: { kind: "set", value: WEBHOOK_SECRET } })
		).resolves.toEqual({ kind: "master-key-missing" });
		expect(mocks.saveAuthSettings).not.toHaveBeenCalled();
	});

	it("第一次保存时 keep：把环境变量中的密钥加密存入数据库", async () => {
		mocks.env.CASDOOR_CLIENT_SECRET = ENV_CLIENT_SECRET;
		mocks.getAuthSettingsRow.mockResolvedValue(null);
		await save();
		await expect(
			decrypted(savedRow().values.clientSecretCipher)
		).resolves.toEqual({ kind: "ok", value: ENV_CLIENT_SECRET });
	});

	it("第一次保存、环境变量中有密钥、没有主密钥：master-key-missing", async () => {
		mocks.env.CASDOOR_CLIENT_SECRET = ENV_CLIENT_SECRET;
		mocks.env.SECRET_ENCRYPTION_KEY = undefined;
		mocks.getAuthSettingsRow.mockResolvedValue(null);
		await expect(save()).resolves.toEqual({
			kind: "master-key-missing",
		});
	});
});

describe("saveEffectiveAuthSettings：修改记录", () => {
	it("只记录字段名和修改类型，不记录任何值", async () => {
		await save({
			clientId: "another-client",
			clientSecret: { kind: "clear" },
			organization: null,
			webhookSecret: { kind: "set", value: WEBHOOK_SECRET },
		});
		const { actorId, changedFields } = savedRow();
		expect(actorId).toBe(ACTOR.id);
		expect(changedFields).toEqual([
			{ change: "cleared", field: "organization" },
			{ change: "changed", field: "clientId" },
			{ change: "cleared", field: "clientSecret" },
			{ change: "changed", field: "webhookSecret" },
		]);
		const text = JSON.stringify(changedFields);
		for (const value of [WEBHOOK_SECRET, OLD_CLIENT_SECRET, "another-client"]) {
			expect(text).not.toContain(value);
		}
	});

	it("没有修改：仍然写修改记录（空列表），不清除上次测试时间", async () => {
		await save();
		expect(savedRow().changedFields).toEqual([]);
		expect(savedRow().values.lastTestOkAt).toBeUndefined();
	});

	it("有修改：清除上次测试成功的时间", async () => {
		await save({ adminRole: "other" });
		expect(savedRow().values.lastTestOkAt).toBeNull();
	});

	it("修改项目管理员角色名：写入新值，修改记录只有字段名（#15）", async () => {
		await save({ projectAdminRole: "other-project-admin" });
		expect(savedRow().values.projectAdminRole).toBe("other-project-admin");
		expect(savedRow().changedFields).toEqual([
			{ change: "changed", field: "projectAdminRole" },
		]);
	});

	it("清空一个本来没有的密钥：不记录", async () => {
		await save({ webhookSecret: { kind: "clear" } });
		expect(savedRow().changedFields).toEqual([]);
	});
});

describe("saveEffectiveAuthSettings：认证方式变化", () => {
	it("认证方式变化：写一行审计日志，包含操作人，不含密钥", async () => {
		mocks.env.AUTH_PROVIDER = "casdoor";
		mocks.getAuthSettingsRow.mockResolvedValue(null);
		const auditLog = vi.fn();
		await save(
			{ clientSecret: { kind: "set", value: CLIENT_SECRET } },
			{ auditLog }
		);
		expect(auditLog).toHaveBeenCalledTimes(1);
		const message = String(auditLog.mock.calls[0]?.[0]);
		expect(message).toContain("admin");
		expect(message).toContain("local");
		expect(message).not.toContain(CLIENT_SECRET);
		expect(savedRow().changedFields).toContainEqual({
			change: "changed",
			field: "provider",
		});
	});

	it("认证方式不变：不写审计日志", async () => {
		const auditLog = vi.fn();
		await save({}, { auditLog });
		expect(auditLog).not.toHaveBeenCalled();
	});
});
