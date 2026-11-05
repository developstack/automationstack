import type { SaveStorageSettingsInput } from "@automationstack/api/storage/settings-input";
import type { StorageSettingsView } from "@automationstack/api/storage/settings-view";

import { formatDateTime } from "@/components/cases/case-meta";

export type StorageBackendValue = StorageSettingsView["backend"];

export interface StorageSettingsFormValues {
	backend: StorageBackendValue;
	/** 为 true 时，保存会清空已保存的 Secret Access Key。 */
	clearSecretAccessKey: boolean;
	publicBaseUrl: string;
	r2AccessKeyId: string;
	r2Bucket: string;
	r2Endpoint: string;
	/** 新的 Secret Access Key。为空表示保留已保存的值。 */
	r2SecretAccessKey: string;
}

export interface StorageSettingsFieldErrors {
	publicBaseUrl: string | null;
	r2AccessKeyId: string | null;
	r2Bucket: string | null;
	r2Endpoint: string | null;
	r2SecretAccessKey: string | null;
}

export const BACKEND_LABELS: Record<StorageBackendValue, string> = {
	local: "服务器本地",
	r2: "Cloudflare R2",
};

export const SOURCE_LABELS: Record<StorageSettingsView["source"], string> = {
	database: "页面配置",
	env: "环境变量",
};

export const SOURCE_NOTES: Record<StorageSettingsView["source"], string> = {
	database: "存储设置已在本页面保存过。之后修改环境变量 R2_* 不再生效。",
	env: "现在使用环境变量中的值：R2_* 完整时使用 R2，否则使用服务器本地。在本页面保存一次后，服务改用页面配置。",
};

export function initialStorageSettingsValues(
	view: StorageSettingsView
): StorageSettingsFormValues {
	return {
		backend: view.backend,
		clearSecretAccessKey: false,
		publicBaseUrl: view.publicBaseUrl ?? "",
		r2AccessKeyId: view.r2AccessKeyId ?? "",
		r2Bucket: view.r2Bucket ?? "",
		r2Endpoint: view.r2Endpoint ?? "",
		r2SecretAccessKey: "",
	};
}

function nullIfBlank(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function secretUpdate(
	values: StorageSettingsFormValues
): SaveStorageSettingsInput["r2SecretAccessKey"] {
	if (values.clearSecretAccessKey) {
		return { kind: "clear" };
	}
	const value = values.r2SecretAccessKey.trim();
	return value === "" ? { kind: "keep" } : { kind: "set", value };
}

export function toStorageSettingsSaveInput(
	values: StorageSettingsFormValues
): SaveStorageSettingsInput {
	return {
		backend: values.backend,
		publicBaseUrl: nullIfBlank(values.publicBaseUrl),
		r2AccessKeyId: nullIfBlank(values.r2AccessKeyId),
		r2Bucket: nullIfBlank(values.r2Bucket),
		r2Endpoint: nullIfBlank(values.r2Endpoint),
		r2SecretAccessKey: secretUpdate(values),
	};
}

function urlError(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === "") {
		return null;
	}
	if (!URL.canParse(trimmed)) {
		return "必须是完整的地址，例如 https://example.com";
	}
	const { protocol } = new URL(trimmed);
	return protocol === "http:" || protocol === "https:"
		? null
		: "必须是 http 或 https 地址";
}

function requiredError(
	values: StorageSettingsFormValues,
	value: string
): string | null {
	return values.backend === "r2" && value.trim() === "" ? "必须填写" : null;
}

/**
 * 页面中的检查。服务端做相同的检查，并在保存前测试 R2 的连接。
 * 存储方式是本地时，R2 的字段可以不填。
 */
export function validateStorageSettingsForm(
	values: StorageSettingsFormValues,
	view: StorageSettingsView
): StorageSettingsFieldErrors {
	const secretMissing =
		values.backend === "r2" &&
		values.r2SecretAccessKey.trim() === "" &&
		(values.clearSecretAccessKey || !view.hasSecretAccessKey);
	return {
		publicBaseUrl: urlError(values.publicBaseUrl),
		r2AccessKeyId: requiredError(values, values.r2AccessKeyId),
		r2Bucket: requiredError(values, values.r2Bucket),
		r2Endpoint:
			requiredError(values, values.r2Endpoint) ?? urlError(values.r2Endpoint),
		r2SecretAccessKey: secretMissing ? "必须填写" : null,
	};
}

export function hasStorageSettingsError(
	errors: StorageSettingsFieldErrors
): boolean {
	return Object.values(errors).some((error) => error !== null);
}

export function lastChangeLabel(view: StorageSettingsView): string {
	if (view.source === "env" || view.updatedAt === null) {
		return "没有记录";
	}
	const at = formatDateTime(view.updatedAt);
	return view.updatedByUsername === null
		? at
		: `${view.updatedByUsername} · ${at}`;
}
