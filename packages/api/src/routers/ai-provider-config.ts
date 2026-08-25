/**
 * AI provider 登记表的管理端路由。
 *
 * 这一页是**配置登记处**，不是生效决策点：登记多少行都不影响生成入口读什么
 * 配置（生效口径见 packages/ai/src/config-store.ts）。路由只做登记行的
 * 增删改查 + models.dev 目录的两个查询。
 *
 * 安全底线：**API Key 无论明文还是密文都不出现在任何返回值里**。为此
 * `AiProviderConfigView` 是一个独立声明的接口，逐字段手工构造——刻意不用
 * `Omit<AiProviderConfig, "apiKeyCiphertext">` 再 spread：后者在给表加新的敏感
 * 列时会静默地把它带出去，而独立接口会在编译期少一个字段就报错。
 */

import type { ApiKeyUpdate } from "@automationstack/ai/config-store";
import {
	createAiProviderConfig,
	isSecretStorageAvailable,
	updateAiProviderConfigById,
} from "@automationstack/ai/config-store";
import {
	listCatalogModels,
	listCatalogProviders,
	MAX_CATALOG_RESULTS,
} from "@automationstack/ai/models-dev/catalog-query";
import {
	deleteAiProviderConfig,
	listAiProviderConfigs,
	MAX_PROVIDER_PAGE_SIZE,
} from "@automationstack/db/repositories/ai-provider-config-repository";
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

const pageSchema = z.number().int().min(1);
const pageSizeSchema = z.number().int().min(1).max(MAX_PROVIDER_PAGE_SIZE);

/**
 * 省略 = 保持库里已有的 Key 不动（编辑其他字段的常规保存）。
 * 想撤销 Key 必须显式把 `clearApiKey` 设为 true——空字符串一律按「没填」处理，
 * 否则前端一个未受控输入框失焦就会把线上的 Key 抹掉。
 */
const saveInputSchema = z.object({
	apiKey: z.string().trim().min(1).max(MAX_API_KEY_LENGTH).optional(),
	baseUrl: z.url(),
	clearApiKey: z.boolean().default(false),
	modelId: identifierSchema,
	providerId: identifierSchema,
});

const listInputSchema = z.object({
	keyword: keywordSchema,
	page: pageSchema,
	pageSize: pageSizeSchema,
});

/** 可以安全下发到前端的登记字段：**没有任何 Key 相关字段**。 */
export interface AiProviderConfigView {
	baseUrl: string;
	/** 是否已存有 API Key。只有布尔，绝不下发内容或长度。 */
	hasApiKey: boolean;
	id: string;
	modelId: string;
	providerId: string;
	updatedAt: Date;
	updatedByUsername: string | null;
}

export interface AiProviderConfigListResult {
	page: number;
	pageSize: number;
	rows: AiProviderConfigView[];
	/**
	 * 主密钥是否就绪；false 时保存/清除 API Key 会被拒，前端据此先把输入框
	 * 禁掉并说明原因（019 的行为，跟着登记表一起从旧 get 路由搬过来）。
	 */
	secretStorageAvailable: boolean;
	total: number;
}

async function resolveUsernames(
	rows: AiProviderConfig[]
): Promise<Map<string, string>> {
	const ids = [
		...new Set(rows.map((row) => row.updatedBy).filter((id) => id !== null)),
	];
	const users = await Promise.all(ids.map((id) => getUserById(id)));
	const usernames = new Map<string, string>();
	for (const user of users) {
		if (user !== null) {
			usernames.set(user.id, user.username);
		}
	}
	return usernames;
}

async function toViews(
	rows: AiProviderConfig[]
): Promise<AiProviderConfigView[]> {
	const usernames = await resolveUsernames(rows);
	return rows.map((row) => ({
		baseUrl: row.baseUrl,
		hasApiKey: row.apiKeyCiphertext !== null,
		id: row.id,
		modelId: row.modelId,
		providerId: row.providerId,
		updatedAt: row.updatedAt,
		updatedByUsername:
			row.updatedBy === null ? null : (usernames.get(row.updatedBy) ?? null),
	}));
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

/** 单行转视图：create/update 只有一行，复用批量路径但把「空」变成不可能。 */
async function toOneView(row: AiProviderConfig): Promise<AiProviderConfigView> {
	const [view] = await toViews([row]);
	if (view === undefined) {
		throw new Error("toOneView: expected exactly one view");
	}
	return view;
}

const MASTER_KEY_MISSING_MESSAGE =
	"未配置 SECRET_ENCRYPTION_KEY，无法加密保存 API Key（openssl rand -base64 32）";

export const aiProviderConfigRouter = {
	create: adminProcedure
		.errors({ BAD_REQUEST: {}, PRECONDITION_FAILED: {} })
		.input(saveInputSchema)
		.handler(
			async ({ context, errors, input }): Promise<AiProviderConfigView> => {
				if (input.clearApiKey && input.apiKey !== undefined) {
					throw errors.BAD_REQUEST({
						message: "apiKey 与 clearApiKey 不能同时提供",
					});
				}
				const result = await createAiProviderConfig({
					apiKey: toApiKeyUpdate(input),
					baseUrl: input.baseUrl,
					modelId: input.modelId,
					providerId: input.providerId,
					updatedBy: context.user.id,
				});
				if (result.kind !== "ok") {
					throw errors.PRECONDITION_FAILED({
						message: MASTER_KEY_MISSING_MESSAGE,
					});
				}
				return await toOneView(result.row);
			}
		),

	delete: adminProcedure
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ input }): Promise<{ deleted: boolean }> => {
			// 幂等：行已经不存在也按成功处理，前端不给「刷新才能消掉」的报错
			const deleted = await deleteAiProviderConfig(input.id);
			return { deleted };
		}),

	list: adminProcedure
		.input(listInputSchema)
		.handler(async ({ input }): Promise<AiProviderConfigListResult> => {
			const result = await listAiProviderConfigs({
				keyword: input.keyword,
				page: input.page,
				pageSize: input.pageSize,
			});
			return {
				page: result.page,
				pageSize: result.pageSize,
				rows: await toViews(result.items),
				secretStorageAvailable: isSecretStorageAvailable(),
				total: result.total,
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

	update: adminProcedure
		.errors({ BAD_REQUEST: {}, NOT_FOUND: {}, PRECONDITION_FAILED: {} })
		.input(saveInputSchema.extend({ id: z.uuid() }))
		.handler(
			async ({ context, errors, input }): Promise<AiProviderConfigView> => {
				if (input.clearApiKey && input.apiKey !== undefined) {
					throw errors.BAD_REQUEST({
						message: "apiKey 与 clearApiKey 不能同时提供",
					});
				}
				const result = await updateAiProviderConfigById(input.id, {
					apiKey: toApiKeyUpdate(input),
					baseUrl: input.baseUrl,
					modelId: input.modelId,
					providerId: input.providerId,
					updatedBy: context.user.id,
				});
				if (result.kind === "master-key-missing") {
					throw errors.PRECONDITION_FAILED({
						message: MASTER_KEY_MISSING_MESSAGE,
					});
				}
				if (result.kind === "not-found") {
					throw errors.NOT_FOUND({ message: "该条登记不存在或已被删除" });
				}
				return await toOneView(result.row);
			}
		),
};
