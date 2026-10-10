import {
	CASDOOR_WEBHOOK_SECRET_MIN_LENGTH,
	parseOriginUrl,
} from "@automationstack/env/casdoor-rules";
import { z } from "zod";

import {
	CASDOOR_BUILT_IN_ORGANIZATION,
	CASDOOR_CALLBACK_PATH,
} from "./casdoor-paths";

const MAX_URL_LENGTH = 512;
const MAX_NAME_LENGTH = 128;
const MAX_CLIENT_ID_LENGTH = 256;
const MAX_CLIENT_SECRET_LENGTH = 512;
const MAX_WEBHOOK_SECRET_LENGTH = 256;

/** 空字符串和 null 都表示「不设置」，保存为 null。 */
const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullable()
		.transform((value) => (value === "" ? null : value));

/** 密钥字段的三种更新：保留原值、设置新值、清空。前端不会收到密钥的值。 */
const secretUpdateSchema = (value: z.ZodString) =>
	z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("keep") }),
		z.object({ kind: z.literal("clear") }),
		z.object({ kind: z.literal("set"), value }),
	]);

export const saveAuthSettingsSchema = z.object({
	adminRole: optionalText(MAX_NAME_LENGTH),
	clientId: optionalText(MAX_CLIENT_ID_LENGTH),
	clientSecret: secretUpdateSchema(
		z.string().trim().min(1).max(MAX_CLIENT_SECRET_LENGTH)
	),
	issuer: optionalText(MAX_URL_LENGTH),
	organization: optionalText(MAX_NAME_LENGTH),
	projectAdminRole: optionalText(MAX_NAME_LENGTH),
	provider: z.enum(["local", "casdoor"]),
	redirectUrl: optionalText(MAX_URL_LENGTH),
	webhookSecret: secretUpdateSchema(
		z
			.string()
			.trim()
			.min(
				CASDOOR_WEBHOOK_SECRET_MIN_LENGTH,
				`Webhook 密钥至少 ${CASDOOR_WEBHOOK_SECRET_MIN_LENGTH} 个字符`
			)
			.max(MAX_WEBHOOK_SECRET_LENGTH)
	),
});

export type SaveAuthSettingsInput = z.output<typeof saveAuthSettingsSchema>;

export type SecretUpdate = SaveAuthSettingsInput["clientSecret"];

export type CheckedAuthSettings =
	| { kind: "invalid"; message: string }
	| { kind: "ok"; input: SaveAuthSettingsInput };

type CheckedIssuer =
	| { kind: "invalid"; message: string }
	| { kind: "ok"; origin: string | null };

function checkIssuer(
	issuer: string | null,
	production: boolean
): CheckedIssuer {
	if (issuer === null) {
		return { kind: "ok", origin: null };
	}
	const origin = parseOriginUrl(issuer);
	if (origin === null) {
		return {
			kind: "invalid",
			message:
				"公网地址只能包含协议、主机和端口，例如 https://casdoor.example.com",
		};
	}
	if (production && !origin.startsWith("https://")) {
		return { kind: "invalid", message: "生产环境中，公网地址必须使用 https" };
	}
	return { kind: "ok", origin };
}

function isCallbackUrl(value: string): boolean {
	if (!URL.canParse(value)) {
		return false;
	}
	const url = new URL(value);
	return (
		(url.protocol === "http:" || url.protocol === "https:") &&
		url.pathname.endsWith(CASDOOR_CALLBACK_PATH) &&
		url.search === "" &&
		url.hash === ""
	);
}

function checkOtherFields(input: SaveAuthSettingsInput): string | null {
	if (
		input.organization?.toLowerCase() ===
		CASDOOR_BUILT_IN_ORGANIZATION.toLowerCase()
	) {
		return "组织不能是 built-in：built-in 中的每个用户都是 Casdoor 的全局管理员";
	}
	if (input.redirectUrl !== null && !isCallbackUrl(input.redirectUrl)) {
		return `回调地址必须是 http(s) 地址，并且以 ${CASDOOR_CALLBACK_PATH} 结尾`;
	}
	if (input.provider === "casdoor" && input.clientSecret.kind === "clear") {
		return "Casdoor 模式下不能清空 Client Secret。只有本地模式下可以清空";
	}
	return null;
}

/**
 * 检查认证设置的输入（plan 021 D11、§10.2、§10.5 第 3 项），并把公网地址规范为 origin。
 * 不检查「Casdoor 模式尚未实现」：那是阶段 2 的限制，由接口处理。
 */
export function checkAuthSettingsInput(
	input: SaveAuthSettingsInput,
	options: { production: boolean }
): CheckedAuthSettings {
	const issuer = checkIssuer(input.issuer, options.production);
	if (issuer.kind === "invalid") {
		return issuer;
	}
	const message = checkOtherFields(input);
	if (message !== null) {
		return { kind: "invalid", message };
	}
	return { input: { ...input, issuer: issuer.origin }, kind: "ok" };
}
