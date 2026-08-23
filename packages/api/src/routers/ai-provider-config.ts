/**
 * 平台级唯一那份 AI provider 配置的管理端路由。
 *
 * 安全底线：**API Key 无论明文还是密文都不出现在任何返回值里**。为此
 * `AiProviderConfigView` 是一个独立声明的接口，逐字段手工构造——刻意不用
 * `Omit<AiProviderConfig, "apiKeyCiphertext">` 再 spread：后者在给表加新的敏感
 * 列时会静默地把它带出去，而独立接口会在编译期少一个字段就报错。
 */

import type { ApiKeyUpdate } from "@automationstack/ai/config-store";
import {
	isSecretStorageAvailable,
	storeAiProviderConfig,
} from "@automationstack/ai/config-store";
import {
	listCatalogModels,
	listCatalogProviders,
	MAX_CATALOG_RESULTS,
} from "@automationstack/ai/models-dev/catalog-query";
import { readAiConfigStatus } from "@automationstack/ai/provider";
import { getAiProviderConfig } from "@automationstack/db/repositories/ai-provider-config-repository";
import { getUserById } from "@automationstack/db/repositories/users-repository";
import type { AiProviderConfig } from "@automationstack/db/schema/ai";
import { z } from "zod";

import { adminProcedure } from "../index";

const MAX_KEYWORD_LENGTH = 64;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_API_KEY_LENGTH = 512;

const keywordSchema = z.string().trim().max(MAX_KEYWORD_LENGTH).optional();
const limitSchema = z.number().int().min(1).max(MAX_CATALOG_RESULTS).optional();
const identifierSchema = z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH);

const saveInputSchema = z.object({
	/**
	 * 省略 = 保持库里已有的 Key 不动（编辑其他字段的常规保存）。
	 * 想撤销 Key 必须显式把 `clearApiKey` 设为 true——空字符串一律按「没填」处理，
	 * 否则前端一个未受控输入框失焦就会把线上的 Key 抹掉。
	 */
	apiKey: z.string().trim().min(1).max(MAX_API_KEY_LENGTH).optional(),
	baseUrl: z.url(),
	clearApiKey: z.boolean().default(false),
	modelId: identifierSchema,
	providerId: identifierSchema,
});

/** 可以安全下发到前端的配置字段：**没有任何 Key 相关字段**。 */
export interface AiProviderConfigView {
	baseUrl: string;
	/** 是否已存有 API Key。只有布尔，绝不下发内容或长度。 */
	hasApiKey: boolean;
	modelId: string;
	providerId: string;
	updatedAt: Date;
	updatedByUsername: string | null;
}

export interface AiProviderConfigState {
	config: AiProviderConfigView | null;
	/** 当前生效配置不可用的原因；null 表示可用。 */
	problem: string | null;
	/** 主密钥是否就绪；false 时保存 API Key 会被拒。 */
	secretStorageAvailable: boolean;
}

async function resolveUpdatedByUsername(
	updatedBy: string | null
): Promise<string | null> {
	if (updatedBy === null) {
		return null;
	}
	const user = await getUserById(updatedBy);
	return user?.username ?? null;
}

async function toView(row: AiProviderConfig): Promise<AiProviderConfigView> {
	return {
		baseUrl: row.baseUrl,
		hasApiKey: row.apiKeyCiphertext !== null,
		modelId: row.modelId,
		providerId: row.providerId,
		updatedAt: row.updatedAt,
		updatedByUsername: await resolveUpdatedByUsername(row.updatedBy),
	};
}

function toApiKeyUpdate(input: {
	apiKey?: string;
	clearApiKey: boolean;
}): ApiKeyUpdate {
	if (input.clearApiKey) {
		return { kind: "clear" };
	}
	if (input.apiKey === undefined) {
		return { kind: "keep" };
	}
	return { kind: "set", value: input.apiKey };
}

export const aiProviderConfigRouter = {
	get: adminProcedure.handler(async (): Promise<AiProviderConfigState> => {
		const row = await getAiProviderConfig();
		const status = await readAiConfigStatus();
		return {
			config: row === null ? null : await toView(row),
			problem: status.problem,
			secretStorageAvailable: isSecretStorageAvailable(),
		};
	}),

	listModels: adminProcedure
		.input(
			z.object({
				keyword: keywordSchema,
				limit: limitSchema,
				providerId: identifierSchema,
			})
		)
		.handler(({ input }) =>
			listCatalogModels({
				keyword: input.keyword,
				limit: input.limit,
				providerId: input.providerId,
			})
		),

	listProviders: adminProcedure
		.input(z.object({ keyword: keywordSchema, limit: limitSchema }))
		.handler(({ input }) =>
			listCatalogProviders({ keyword: input.keyword, limit: input.limit })
		),

	save: adminProcedure
		.errors({ BAD_REQUEST: {}, PRECONDITION_FAILED: {} })
		.input(saveInputSchema)
		.handler(
			async ({ context, errors, input }): Promise<AiProviderConfigView> => {
				if (input.clearApiKey && input.apiKey !== undefined) {
					throw errors.BAD_REQUEST({
						message: "apiKey 与 clearApiKey 不能同时提供",
					});
				}
				const result = await storeAiProviderConfig({
					apiKey: toApiKeyUpdate(input),
					baseUrl: input.baseUrl,
					modelId: input.modelId,
					providerId: input.providerId,
					updatedBy: context.user.id,
				});
				if (result.kind !== "ok") {
					throw errors.PRECONDITION_FAILED({
						message:
							"未配置 SECRET_ENCRYPTION_KEY，无法加密保存 API Key（openssl rand -base64 32）",
					});
				}
				return await toView(result.row);
			}
		),
};
