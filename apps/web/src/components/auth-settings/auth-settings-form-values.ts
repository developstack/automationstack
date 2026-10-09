import { CASDOOR_BUILT_IN_ORGANIZATION } from "@automationstack/api/auth/casdoor-paths";
import type { SaveAuthSettingsInput } from "@automationstack/api/auth/settings-input";
import type { AuthSettingsView } from "@automationstack/api/auth/settings-view";
import {
	CASDOOR_WEBHOOK_SECRET_MIN_LENGTH,
	parseOriginUrl,
} from "@automationstack/env/casdoor-rules";

export type AuthProviderValue = AuthSettingsView["provider"];

export interface AuthSettingsFormValues {
	adminRole: string;
	clearClientSecret: boolean;
	clearWebhookSecret: boolean;
	clientId: string;
	clientSecret: string;
	issuer: string;
	organization: string;
	provider: AuthProviderValue;
	redirectUrl: string;
	webhookSecret: string;
}

export interface AuthSettingsFieldErrors {
	issuer: string | null;
	organization: string | null;
	redirectUrl: string | null;
	webhookSecret: string | null;
}

type SecretUpdate = SaveAuthSettingsInput["clientSecret"];

const WEBHOOK_SECRET_BYTES = 32;
const BASE64_PLUS = /\+/g;
const BASE64_SLASH = /\//g;
const BASE64_PADDING = /[=]+$/;

/** 回调地址的建议值：浏览器访问 server 的地址加上回调路径。 */
export function suggestedRedirectUrl(
	serverUrl: string,
	callbackPath: string
): string {
	return new URL(callbackPath, serverUrl).href;
}

export function initialAuthSettingsValues(
	view: AuthSettingsView,
	serverUrl: string
): AuthSettingsFormValues {
	return {
		adminRole: view.adminRole ?? "",
		clearClientSecret: false,
		clearWebhookSecret: false,
		clientId: view.clientId ?? "",
		clientSecret: "",
		issuer: view.issuer ?? "",
		organization: view.organization ?? "",
		provider: view.provider,
		redirectUrl:
			view.redirectUrl ?? suggestedRedirectUrl(serverUrl, view.callbackPath),
		webhookSecret: "",
	};
}

function validateIssuer(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === "" || parseOriginUrl(trimmed) !== null) {
		return null;
	}
	return "只填写协议、主机和端口，例如 https://casdoor.example.com";
}

function validateOrganization(value: string): string | null {
	return value.trim().toLowerCase() === CASDOOR_BUILT_IN_ORGANIZATION
		? "不能使用 built-in：built-in 中的每个用户都是 Casdoor 的全局管理员。"
		: null;
}

function validateRedirectUrl(
	value: string,
	callbackPath: string
): string | null {
	const trimmed = value.trim();
	if (trimmed === "") {
		return null;
	}
	if (!URL.canParse(trimmed)) {
		return "请填写完整的 http(s) 地址。";
	}
	return new URL(trimmed).pathname.endsWith(callbackPath)
		? null
		: `回调地址必须以 ${callbackPath} 结尾。`;
}

function validateWebhookSecret(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === "" || trimmed.length >= CASDOOR_WEBHOOK_SECRET_MIN_LENGTH) {
		return null;
	}
	return `Webhook 密钥至少 ${CASDOOR_WEBHOOK_SECRET_MIN_LENGTH} 个字符。`;
}

export function validateAuthSettingsForm(
	values: AuthSettingsFormValues,
	callbackPath: string
): AuthSettingsFieldErrors {
	return {
		issuer: validateIssuer(values.issuer),
		organization: validateOrganization(values.organization),
		redirectUrl: validateRedirectUrl(values.redirectUrl, callbackPath),
		webhookSecret: validateWebhookSecret(values.webhookSecret),
	};
}

export function hasAuthSettingsError(errors: AuthSettingsFieldErrors): boolean {
	return Object.values(errors).some((message) => message !== null);
}

function secretUpdateOf(value: string, clear: boolean): SecretUpdate {
	if (clear) {
		return { kind: "clear" };
	}
	const trimmed = value.trim();
	return trimmed === "" ? { kind: "keep" } : { kind: "set", value: trimmed };
}

function textOrNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

export function toAuthSettingsSaveInput(
	values: AuthSettingsFormValues
): SaveAuthSettingsInput {
	return {
		adminRole: textOrNull(values.adminRole),
		clientId: textOrNull(values.clientId),
		clientSecret: secretUpdateOf(values.clientSecret, values.clearClientSecret),
		issuer: textOrNull(values.issuer),
		organization: textOrNull(values.organization),
		provider: values.provider,
		redirectUrl: textOrNull(values.redirectUrl),
		webhookSecret: secretUpdateOf(
			values.webhookSecret,
			values.clearWebhookSecret
		),
	};
}

/** 生成 webhook 密钥：32 个随机字节，编码为 base64url（43 个字符）。 */
export function generateWebhookSecret(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(WEBHOOK_SECRET_BYTES));
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(BASE64_PLUS, "-")
		.replace(BASE64_SLASH, "_")
		.replace(BASE64_PADDING, "");
}
