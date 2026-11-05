import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveStorageSettingsInput } from "./settings-input";
import type { EffectiveStorageSettings } from "./settings-model";
import { saveEffectiveStorageSettings } from "./settings-save";

const mocks = vi.hoisted(() => ({
	current: null as unknown,
	env: {
		SECRET_ENCRYPTION_KEY: "U0t6cb4rxrzmt9qa9Po0Txv+IoE5wZ/3ZBYkt7TBbxo=",
	} as Record<string, string | undefined>,
	save: vi.fn(),
}));

vi.mock("@automationstack/env/server", () => ({ env: mocks.env }));
vi.mock("@automationstack/db/repositories/storage-settings-repository", () => ({
	saveStorageSettings: mocks.save,
}));
vi.mock("./settings-store", () => ({
	getEffectiveStorageSettings: () => Promise.resolve(mocks.current),
	invalidateStorageSettingsCache: vi.fn(),
}));

const ACTOR = { id: "user-1", username: "admin" };

const ENV_R2: EffectiveStorageSettings = {
	backend: "r2",
	credentialProblem: null,
	r2: {
		accessKeyId: "env-key",
		bucket: "env-bucket",
		endpoint: "https://env.r2.example.test",
		publicBaseUrl: null,
		secretAccessKey: { present: true, value: "env-secret" },
	},
	source: "env",
	updatedAt: null,
	updatedBy: null,
};

const LOCAL_INPUT: SaveStorageSettingsInput = {
	backend: "local",
	publicBaseUrl: null,
	r2AccessKeyId: "env-key",
	r2Bucket: "env-bucket",
	r2Endpoint: "https://env.r2.example.test",
	r2SecretAccessKey: { kind: "keep" },
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.current = ENV_R2;
	mocks.env.SECRET_ENCRYPTION_KEY =
		"U0t6cb4rxrzmt9qa9Po0Txv+IoE5wZ/3ZBYkt7TBbxo=";
});

describe("saveEffectiveStorageSettings", () => {
	it("first save from env: keeps the env secret encrypted, logs only field names", async () => {
		const check = vi.fn();
		await expect(
			saveEffectiveStorageSettings(LOCAL_INPUT, ACTOR, check)
		).resolves.toEqual({ kind: "ok" });
		expect(check).not.toHaveBeenCalled();
		const saved = mocks.save.mock.calls[0]?.[0];
		expect(saved.values.backend).toBe("local");
		expect(saved.values.r2SecretAccessKeyCipher).toEqual(expect.any(String));
		expect(saved.values.r2SecretAccessKeyCipher).not.toContain("env-secret");
		expect(saved.changedFields).toEqual([
			{ change: "changed", field: "backend" },
		]);
	});

	it("R2: checks the connection with the new secret before it saves", async () => {
		const check = vi.fn().mockResolvedValue("R2 拒绝了请求");
		const input = {
			...LOCAL_INPUT,
			backend: "r2",
			r2SecretAccessKey: { kind: "set", value: "new-secret" },
		} as const;
		await expect(
			saveEffectiveStorageSettings(input, ACTOR, check)
		).resolves.toEqual({
			kind: "connection-failed",
			message: "R2 拒绝了请求",
		});
		expect(check).toHaveBeenCalledWith(
			expect.objectContaining({
				bucket: "env-bucket",
				secretAccessKey: "new-secret",
			})
		);
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("without a master key, a secret cannot be saved", async () => {
		mocks.env.SECRET_ENCRYPTION_KEY = undefined;
		await expect(
			saveEffectiveStorageSettings(LOCAL_INPUT, ACTOR, vi.fn())
		).resolves.toEqual({ kind: "master-key-missing" });
		expect(mocks.save).not.toHaveBeenCalled();
	});
});
