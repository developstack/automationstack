import { sha256Hex } from "../hmac";
import type { EffectiveAuthSettings } from "../settings-model";

/** Casdoor 的完整连接参数。登录、回调和对账都需要全部字段。密钥是明文，只在服务端使用。 */
export interface CasdoorConnection {
	adminRole: string;
	clientId: string;
	clientSecret: string;
	/** 集群内地址（CASDOOR_INTERNAL_URL）。服务端请求都发往这个地址（D11）。 */
	internalUrl: string;
	/** 公网地址。浏览器跳转使用它，ID token 的 iss 必须等于它。 */
	issuer: string;
	organization: string;
	redirectUrl: string;
}

export type CasdoorField = keyof CasdoorConnection;

/** 连接参数的中文名称。错误信息使用这些名称。 */
export const CASDOOR_FIELD_LABELS: Record<CasdoorField, string> = {
	adminRole: "管理员角色名",
	clientId: "Client ID",
	clientSecret: "Client Secret",
	internalUrl: "集群内地址（CASDOOR_INTERNAL_URL）",
	issuer: "公网地址",
	organization: "组织",
	redirectUrl: "回调地址",
};

/** 字段可以为空的连接参数。测试连接时使用：每一步只检查自己需要的字段。 */
export type CasdoorConnectionDraft = {
	[K in CasdoorField]: string | null;
};

export type CompleteConnection =
	| { connection: CasdoorConnection; kind: "ok" }
	| { kind: "incomplete"; missing: CasdoorField[] };

const FIELD_ORDER: readonly CasdoorField[] = [
	"issuer",
	"internalUrl",
	"organization",
	"clientId",
	"clientSecret",
	"redirectUrl",
	"adminRole",
];

export function draftFromSettings(
	settings: EffectiveAuthSettings
): CasdoorConnectionDraft {
	return {
		adminRole: settings.adminRole,
		clientId: settings.clientId,
		clientSecret: settings.clientSecret.value,
		internalUrl: settings.internalUrl,
		issuer: settings.issuer,
		organization: settings.organization,
		redirectUrl: settings.redirectUrl,
	};
}

export function completeConnection(
	draft: CasdoorConnectionDraft
): CompleteConnection {
	const missing = FIELD_ORDER.filter((field) => !draft[field]);
	if (missing.length > 0) {
		return { kind: "incomplete", missing };
	}
	return { connection: draft as CasdoorConnection, kind: "ok" };
}

/** 当前生效设置中的完整连接参数。字段不全或密钥不能解密时返回 null。 */
export function connectionFromSettings(
	settings: EffectiveAuthSettings
): CasdoorConnection | null {
	const complete = completeConnection(draftFromSettings(settings));
	return complete.kind === "ok" ? complete.connection : null;
}

export function describeMissingFields(
	missing: readonly CasdoorField[]
): string {
	return `未填写：${missing.map((field) => CASDOOR_FIELD_LABELS[field]).join("、")}`;
}

/**
 * 连接参数的指纹（plan 021 §10.4）：公网地址、集群内地址、client id、secret 的哈希、回调地址。
 * OIDC 客户端按它缓存，登录 state cookie 中也保存它。指纹中没有明文密钥。
 */
export async function connectionFingerprint(
	connection: Pick<
		CasdoorConnection,
		"clientId" | "clientSecret" | "internalUrl" | "issuer" | "redirectUrl"
	>
): Promise<string> {
	return await sha256Hex(
		JSON.stringify([
			connection.issuer,
			connection.internalUrl,
			connection.clientId,
			await sha256Hex(connection.clientSecret),
			connection.redirectUrl,
		])
	);
}
