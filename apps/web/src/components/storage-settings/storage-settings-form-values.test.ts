import type { StorageSettingsView } from "@automationstack/api/storage/settings-view";
import { describe, expect, it } from "vitest";

import {
	hasStorageSettingsError,
	initialStorageSettingsValues,
	type StorageSettingsFormValues,
	toStorageSettingsSaveInput,
	validateStorageSettingsForm,
} from "@/components/storage-settings/storage-settings-form-values";

const VIEW: StorageSettingsView = {
	activeBackend: "local",
	backend: "local",
	credentialProblem: null,
	hasSecretAccessKey: false,
	localDirectory: "/var/lib/automationstack/files",
	publicBaseUrl: null,
	r2AccessKeyId: null,
	r2Bucket: null,
	r2Endpoint: null,
	secretStorageAvailable: true,
	source: "env",
	updatedAt: null,
	updatedByUsername: null,
};

const R2_VALUES: StorageSettingsFormValues = {
	backend: "r2",
	clearSecretAccessKey: false,
	publicBaseUrl: "",
	r2AccessKeyId: "access-key",
	r2Bucket: "bucket",
	r2Endpoint: "https://account.r2.cloudflarestorage.com",
	r2SecretAccessKey: "secret",
};

describe("toStorageSettingsSaveInput", () => {
	it.each([
		[
			"a new secret is set",
			{ r2SecretAccessKey: " new " },
			{ kind: "set", value: "new" },
		],
		[
			"an empty secret keeps the stored one",
			{ r2SecretAccessKey: "" },
			{ kind: "keep" },
		],
		[
			"clear wins over a typed value",
			{ clearSecretAccessKey: true, r2SecretAccessKey: "x" },
			{ kind: "clear" },
		],
	])("%s", (_name, patch, secret) => {
		expect(
			toStorageSettingsSaveInput({ ...R2_VALUES, ...patch }).r2SecretAccessKey
		).toEqual(secret);
	});

	it("blank text fields are saved as null", () => {
		const input = toStorageSettingsSaveInput(
			initialStorageSettingsValues(VIEW)
		);
		expect(input).toMatchObject({
			backend: "local",
			publicBaseUrl: null,
			r2AccessKeyId: null,
			r2Bucket: null,
			r2Endpoint: null,
		});
	});
});

describe("validateStorageSettingsForm", () => {
	it("local storage needs no R2 field", () => {
		const errors = validateStorageSettingsForm(
			initialStorageSettingsValues(VIEW),
			VIEW
		);
		expect(hasStorageSettingsError(errors)).toBe(false);
	});

	it.each([
		["Endpoint", { r2Endpoint: "" }, "r2Endpoint", "必须填写"],
		[
			"Endpoint",
			{ r2Endpoint: "r2.example.com" },
			"r2Endpoint",
			"必须是完整的地址，例如 https://example.com",
		],
		["Bucket", { r2Bucket: " " }, "r2Bucket", "必须填写"],
		["Access Key ID", { r2AccessKeyId: "" }, "r2AccessKeyId", "必须填写"],
		["Secret", { r2SecretAccessKey: "" }, "r2SecretAccessKey", "必须填写"],
		[
			"public address",
			{ publicBaseUrl: "ftp://img.example.com" },
			"publicBaseUrl",
			"必须是 http 或 https 地址",
		],
	] as const)("R2: %s %j is an error", (_name, patch, field, message) => {
		const errors = validateStorageSettingsForm(
			{ ...R2_VALUES, ...patch },
			VIEW
		);
		expect(errors[field]).toBe(message);
	});

	it("R2 with a stored secret: an empty secret is valid unless it is cleared", () => {
		const view = { ...VIEW, hasSecretAccessKey: true };
		const kept = { ...R2_VALUES, r2SecretAccessKey: "" };
		expect(
			validateStorageSettingsForm(kept, view).r2SecretAccessKey
		).toBeNull();
		expect(
			validateStorageSettingsForm({ ...kept, clearSecretAccessKey: true }, view)
				.r2SecretAccessKey
		).toBe("必须填写");
	});
});
