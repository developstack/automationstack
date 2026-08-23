/**
 * AI provider 配置的读写口子：数据库那份（加密存 API Key）优先，读不到再回落到
 * `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` 三个环境变量。
 *
 * 回落只在「数据库里压根没有一份可用配置」时发生。如果库里明明存了密文却解不开，
 * 这里返回可判别的失败而**不**回落——静默改用环境变量里的另一套凭据，会让管理员
 * 以为自己配的 Key 生效了，账单和调用记录却出现在另一个 provider 上。
 */
import {
	getAiProviderConfig,
	saveAiProviderConfig,
} from "@automationstack/db/repositories/ai-provider-config-repository";
import type { AiProviderConfig } from "@automationstack/db/schema/ai";
import { decryptSecret, encryptSecret } from "@automationstack/db/secret-box";
import { env } from "@automationstack/env/server";

export interface AiRuntimeConfig {
	apiKey: string;
	baseURL: string;
	model: string;
}

export type AiConfigSource = "database" | "environment";

/**
 * 解析结果。三种失败刻意分开，因为处置完全不同：
 * - `unconfigured`：谁都没配 —— 让管理员去配置页填；
 * - `master-key-missing`：库里有密文但 SECRET_ENCRYPTION_KEY 没配（或不是 32
 *   字节）—— 运维补环境变量即可，数据没坏；
 * - `undecryptable`：密钥在，但 GCM 认证失败 —— **主密钥被换过了**，旧密文找不
 *   回来，只能让管理员重填一次 API Key。
 */
export type AiConfigResolution =
	| { kind: "master-key-missing" }
	| { kind: "ok"; config: AiRuntimeConfig; source: AiConfigSource }
	| { kind: "unconfigured" }
	| { kind: "undecryptable" };

function resolveFromEnv(): AiConfigResolution {
	const apiKey = env.AI_API_KEY;
	const baseURL = env.AI_BASE_URL;
	const model = env.AI_MODEL;
	if (!(apiKey && baseURL && model)) {
		return { kind: "unconfigured" };
	}
	return {
		config: { apiKey, baseURL, model },
		kind: "ok",
		source: "environment",
	};
}

async function resolveFromRow(
	row: AiProviderConfig,
	ciphertext: string
): Promise<AiConfigResolution> {
	const masterKey = env.SECRET_ENCRYPTION_KEY;
	if (!masterKey) {
		return { kind: "master-key-missing" };
	}
	const decrypted = await decryptSecret(ciphertext, masterKey);
	if (decrypted.kind === "invalid-key") {
		return { kind: "master-key-missing" };
	}
	if (decrypted.kind !== "ok") {
		return { kind: "undecryptable" };
	}
	return {
		config: {
			apiKey: decrypted.value,
			baseURL: row.baseUrl,
			model: row.modelId,
		},
		kind: "ok",
		source: "database",
	};
}

/**
 * 解析当前生效的 provider 配置。
 *
 * 库里那行缺 API Key（从没填过或被显式清空）时视为「没有可用配置」并回落到环境
 * 变量：没有凭据的 provider 配置本来就调不通，把它当成半成品比让生成整体失败好。
 */
export async function resolveAiConfig(): Promise<AiConfigResolution> {
	const row = await getAiProviderConfig();
	const ciphertext = row?.apiKeyCiphertext;
	if (row && ciphertext) {
		return await resolveFromRow(row, ciphertext);
	}
	return resolveFromEnv();
}

/** 写入时对 API Key 的三种意图，`keep` 与 `clear` 必须能区分开。 */
export type ApiKeyUpdate =
	| { kind: "clear" }
	| { kind: "keep" }
	| { kind: "set"; value: string };

export interface StoreAiProviderConfigInput {
	apiKey: ApiKeyUpdate;
	baseUrl: string;
	modelId: string;
	providerId: string;
	updatedBy: string | null;
}

export type StoreAiProviderConfigResult =
	| { kind: "master-key-missing" }
	| { kind: "ok"; row: AiProviderConfig };

async function encodeApiKey(
	update: ApiKeyUpdate
): Promise<{ ciphertext?: string | null; ok: boolean }> {
	if (update.kind === "keep") {
		return { ok: true };
	}
	if (update.kind === "clear") {
		return { ciphertext: null, ok: true };
	}
	const masterKey = env.SECRET_ENCRYPTION_KEY;
	if (!masterKey) {
		return { ok: false };
	}
	const encrypted = await encryptSecret(update.value, masterKey);
	if (encrypted.kind !== "ok") {
		return { ok: false };
	}
	return { ciphertext: encrypted.box, ok: true };
}

/** 加密 API Key 并写入全局唯一那一行。 */
export async function storeAiProviderConfig(
	input: StoreAiProviderConfigInput
): Promise<StoreAiProviderConfigResult> {
	const encoded = await encodeApiKey(input.apiKey);
	if (!encoded.ok) {
		return { kind: "master-key-missing" };
	}
	const row = await saveAiProviderConfig({
		apiKeyCiphertext: encoded.ciphertext,
		baseUrl: input.baseUrl,
		modelId: input.modelId,
		providerId: input.providerId,
		updatedBy: input.updatedBy,
	});
	return { kind: "ok", row };
}

/** 主密钥是否已配置；配置页据此提示「未配主密钥，无法保存 API Key」。 */
export function isSecretStorageAvailable(): boolean {
	return env.SECRET_ENCRYPTION_KEY !== undefined;
}
