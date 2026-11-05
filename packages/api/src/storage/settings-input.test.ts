import { describe, expect, it } from "vitest";

import {
	checkStorageSettingsInput,
	type SaveStorageSettingsInput,
} from "./settings-input";

const R2_INPUT: SaveStorageSettingsInput = {
	backend: "r2",
	publicBaseUrl: null,
	r2AccessKeyId: "access-key",
	r2Bucket: "bucket",
	r2Endpoint: "https://account.r2.cloudflarestorage.com/",
	r2SecretAccessKey: { kind: "set", value: "secret" },
};

const options = { hasStoredSecret: false, production: true };

describe("checkStorageSettingsInput", () => {
	it("normalizes the addresses: no trailing slash", () => {
		const checked = checkStorageSettingsInput(
			{ ...R2_INPUT, publicBaseUrl: "https://img.example.com//" },
			options
		);
		expect(checked).toMatchObject({
			input: {
				publicBaseUrl: "https://img.example.com",
				r2Endpoint: "https://account.r2.cloudflarestorage.com",
			},
			kind: "ok",
		});
	});

	it.each([
		["Endpoint is missing", { r2Endpoint: null }, "Endpoint"],
		["Bucket is missing", { r2Bucket: null }, "Bucket"],
		["Access Key ID is missing", { r2AccessKeyId: null }, "Access Key ID"],
		[
			"the secret is kept but none is stored",
			{ r2SecretAccessKey: { kind: "keep" } },
			"Secret Access Key",
		],
		[
			"the secret is cleared",
			{ r2SecretAccessKey: { kind: "clear" } },
			"Secret Access Key",
		],
		[
			"the Endpoint uses http in production",
			{ r2Endpoint: "http://r2.example.com" },
			"https",
		],
		[
			"the public address has a query",
			{ publicBaseUrl: "https://img.example.com?a=1" },
			"公开基础地址",
		],
	] as const)("R2: invalid when %s", (_name, patch, mentioned) => {
		const checked = checkStorageSettingsInput(
			{ ...R2_INPUT, ...patch },
			options
		);
		expect(checked.kind).toBe("invalid");
		expect(checked.kind === "invalid" && checked.message).toContain(mentioned);
	});

	it.each([
		[
			"R2 keeps a stored secret",
			{ ...R2_INPUT, r2SecretAccessKey: { kind: "keep" } } as const,
			true,
		],
		[
			"local storage needs no R2 field",
			{
				...R2_INPUT,
				backend: "local",
				r2Bucket: null,
				r2SecretAccessKey: { kind: "keep" },
			} as const,
			false,
		],
	])("valid: %s", (_name, input, hasStoredSecret) => {
		expect(
			checkStorageSettingsInput(input, { ...options, hasStoredSecret }).kind
		).toBe("ok");
	});

	it("allows http outside production", () => {
		const checked = checkStorageSettingsInput(
			{ ...R2_INPUT, r2Endpoint: "http://127.0.0.1:9000" },
			{ ...options, production: false }
		);
		expect(checked.kind).toBe("ok");
	});
});
