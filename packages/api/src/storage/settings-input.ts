import { z } from "zod";

import { optionalText, secretUpdateSchema } from "../settings/input";

const MAX_URL_LENGTH = 512;
const MAX_BUCKET_LENGTH = 63;
const MAX_ACCESS_KEY_LENGTH = 256;
const MAX_SECRET_LENGTH = 512;

export const saveStorageSettingsSchema = z.object({
	backend: z.enum(["local", "r2"]),
	publicBaseUrl: optionalText(MAX_URL_LENGTH),
	r2AccessKeyId: optionalText(MAX_ACCESS_KEY_LENGTH),
	r2Bucket: optionalText(MAX_BUCKET_LENGTH),
	r2Endpoint: optionalText(MAX_URL_LENGTH),
	r2SecretAccessKey: secretUpdateSchema(
		z.string().trim().min(1).max(MAX_SECRET_LENGTH)
	),
});

export type SaveStorageSettingsInput = z.output<
	typeof saveStorageSettingsSchema
>;

export type CheckedStorageSettings =
	| { kind: "invalid"; message: string }
	| { kind: "ok"; input: SaveStorageSettingsInput };

const TRAILING_SLASHES = /\/+$/;

/** http(s) 地址，去掉末尾的 /。不是 http(s) 地址时返回 null。 */
function normalizeUrl(value: string, production: boolean): string | null {
	if (!URL.canParse(value)) {
		return null;
	}
	const url = new URL(value);
	const allowed = production ? ["https:"] : ["http:", "https:"];
	if (!allowed.includes(url.protocol) || url.search !== "" || url.hash !== "") {
		return null;
	}
	return value.replace(TRAILING_SLASHES, "");
}

interface UrlField {
	label: string;
	value: string | null;
}

function checkUrl(field: UrlField, production: boolean) {
	if (field.value === null) {
		return { kind: "ok" as const, value: null };
	}
	const value = normalizeUrl(field.value, production);
	if (value === null) {
		const scheme = production ? "https" : "http 或 https";
		return {
			kind: "invalid" as const,
			message: `${field.label}必须是 ${scheme} 地址，不能带查询参数`,
		};
	}
	return { kind: "ok" as const, value };
}

function missingR2Field(
	input: SaveStorageSettingsInput,
	hasStoredSecret: boolean
): string | null {
	if (input.r2Endpoint === null) {
		return "Endpoint";
	}
	if (input.r2Bucket === null) {
		return "Bucket";
	}
	if (input.r2AccessKeyId === null) {
		return "Access Key ID";
	}
	const secretKept = input.r2SecretAccessKey.kind === "keep" && hasStoredSecret;
	if (!(input.r2SecretAccessKey.kind === "set" || secretKept)) {
		return "Secret Access Key";
	}
	return null;
}

/** 检查存储设置的输入，并规范两个地址。存储方式是 R2 时，四个连接字段都必须有值。 */
export function checkStorageSettingsInput(
	input: SaveStorageSettingsInput,
	options: { hasStoredSecret: boolean; production: boolean }
): CheckedStorageSettings {
	const endpoint = checkUrl(
		{ label: "Endpoint ", value: input.r2Endpoint },
		options.production
	);
	if (endpoint.kind === "invalid") {
		return endpoint;
	}
	const publicBaseUrl = checkUrl(
		{ label: "公开基础地址", value: input.publicBaseUrl },
		options.production
	);
	if (publicBaseUrl.kind === "invalid") {
		return publicBaseUrl;
	}
	const checked = {
		...input,
		publicBaseUrl: publicBaseUrl.value,
		r2Endpoint: endpoint.value,
	};
	if (checked.backend === "r2") {
		const missing = missingR2Field(checked, options.hasStoredSecret);
		if (missing !== null) {
			return {
				kind: "invalid",
				message: `存储方式是 Cloudflare R2 时，必须填写 ${missing}`,
			};
		}
	}
	return { input: checked, kind: "ok" };
}
