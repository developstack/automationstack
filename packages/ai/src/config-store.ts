/**
 * AI provider 配置的两个口子：
 *
 * 1. 生成入口的**生效**配置：只读 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`
 *    三个环境变量。数据库里的 `ai_provider_config` 是给 agent 侧配置预备的
 *    登记表，**不是**生效决策点——agent 侧配置上线前，登记表里有多少行都
 *    不隐式挑任何一行来用（挑了等于替管理员做了他没拍板的事）。等 agent 侧
 *    配置上线，这里会重新接上「读哪份登记」的逻辑。
 * 2. 登记表的写入口（create/update）：加密 API Key 后交给 db 仓库落盘，
 *    本包不碰明文以外的任何持久化。
 */
import {
	insertAiProviderConfig,
	updateAiProviderConfig,
} from "@automationstack/db/repositories/ai-provider-config-repository";
import type { AiProviderConfig } from "@automationstack/db/schema/ai";
import { encryptSecret } from "@automationstack/db/secret-box";
import { env } from "@automationstack/env/server";

export interface AiRuntimeConfig {
	apiKey: string;
	baseURL: string;
	model: string;
}

/**
 * 生效配置的解析结果。只有两种：
 * - `ok`：三个环境变量都配齐了；
 * - `unconfigured`：缺了至少一个——让管理员去补，而不是挑登记表里的某行顶上。
 */
export type AiConfigResolution =
	| { kind: "ok"; config: AiRuntimeConfig }
	| { kind: "unconfigured" };

/**
 * 解析当前生效的 provider 配置（只读环境变量）。
 *
 * 刻意保持同步：这里不再有读库分支，也就没有理由让两个调用方
 * （`provider.ts` 的 createGenerationModel / readAiConfigStatus）多 await 一次。
 */
export function resolveAiConfig(): AiConfigResolution {
	const apiKey = env.AI_API_KEY;
	const baseURL = env.AI_BASE_URL;
	const model = env.AI_MODEL;
	if (!(apiKey && baseURL && model)) {
		return { kind: "unconfigured" };
	}
	return {
		config: { apiKey, baseURL, model },
		kind: "ok",
	};
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

export type UpdateAiProviderConfigResult =
	| { kind: "master-key-missing" }
	| { kind: "not-found" }
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

/** 新增一行登记。`keep` 在创建时没有可保持的东西，等价于不存 Key。 */
export async function createAiProviderConfig(
	input: StoreAiProviderConfigInput
): Promise<StoreAiProviderConfigResult> {
	const encoded = await encodeApiKey(input.apiKey);
	if (!encoded.ok) {
		return { kind: "master-key-missing" };
	}
	const row = await insertAiProviderConfig({
		apiKeyCiphertext: encoded.ciphertext ?? null,
		baseUrl: input.baseUrl,
		modelId: input.modelId,
		providerId: input.providerId,
		updatedBy: input.updatedBy,
	});
	return { kind: "ok", row };
}

/** 按 id 改一行登记；行不存在（别人先删了）返回 not-found。 */
export async function updateAiProviderConfigById(
	id: string,
	input: StoreAiProviderConfigInput
): Promise<UpdateAiProviderConfigResult> {
	const encoded = await encodeApiKey(input.apiKey);
	if (!encoded.ok) {
		return { kind: "master-key-missing" };
	}
	const row = await updateAiProviderConfig(id, {
		// keep = 键不出现，SET 子句完全不碰密文列；encoded.ciphertext 的三态
		// （undefined/null/字符串）正是仓库层 UpdateInput 认的那三态
		apiKeyCiphertext: encoded.ciphertext,
		baseUrl: input.baseUrl,
		modelId: input.modelId,
		providerId: input.providerId,
		updatedBy: input.updatedBy,
	});
	return row === null ? { kind: "not-found" } : { kind: "ok", row };
}

/** 主密钥是否已配置；登记页据此提示「未配主密钥，无法保存 API Key」。 */
export function isSecretStorageAvailable(): boolean {
	return env.SECRET_ENCRYPTION_KEY !== undefined;
}
