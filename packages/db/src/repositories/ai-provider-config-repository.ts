import { count, desc, eq, ilike, or, type SQL } from "drizzle-orm";

import { db } from "../index";
import { type AiProviderConfig, aiProviderConfig } from "../schema/ai";

/**
 * 本仓库只搬运密文，不认识明文——加解密发生在 `packages/ai/src/config-store.ts`。
 * 这样「明文 API Key 出现在哪些调用栈里」是可枚举的，审计时不必读整个 db 包。
 */

export const MAX_PROVIDER_PAGE_SIZE = 100;

/** 登记表的分页查询条件。keyword 为空串/undefined 时不过滤。 */
export interface ListAiProviderConfigsFilter {
	/** ilike 匹配 providerId / modelId / baseUrl，任一命中即返回。 */
	keyword?: string;
	page: number;
	pageSize: number;
}

export interface ListAiProviderConfigsResult {
	items: AiProviderConfig[];
	page: number;
	pageSize: number;
	total: number;
}

/** 新增一行登记。创建没有「保持」可言：不存 Key 就传 null。 */
export interface InsertAiProviderConfigInput {
	apiKeyCiphertext: string | null;
	baseUrl: string;
	modelId: string;
	providerId: string;
	updatedBy: string | null;
}

/**
 * 按 id 改一行登记。
 *
 * `apiKeyCiphertext` 三态：
 * - `undefined`：保持数据库里已有的密文不动（前端没重填 Key 的常规保存）；
 * - `null`：显式清空（管理员要求撤销 Key）；
 * - 字符串：新的密文，覆盖旧值。
 */
export interface UpdateAiProviderConfigInput {
	apiKeyCiphertext?: string | null;
	baseUrl: string;
	modelId: string;
	providerId: string;
	updatedBy: string | null;
}

function buildKeywordCondition(keyword: string): SQL | undefined {
	const trimmed = keyword.trim();
	if (trimmed === "") {
		return undefined;
	}
	// 与 case-list-repository 同款转义：keyword 里的 %/_/\ 是字面量不是通配符
	const escaped = trimmed.replace(/[%_\\]/g, "\\$&");
	const pattern = `%${escaped}%`;
	return or(
		ilike(aiProviderConfig.providerId, pattern),
		ilike(aiProviderConfig.modelId, pattern),
		ilike(aiProviderConfig.baseUrl, pattern)
	);
}

/** 登记 + 搜索 + 分页。按「最近更新在前」排，同一时刻更新的行用 id 决出稳定次序。 */
export async function listAiProviderConfigs(
	filter: ListAiProviderConfigsFilter
): Promise<ListAiProviderConfigsResult> {
	const keywordCondition = buildKeywordCondition(filter.keyword ?? "");
	const page = Math.max(filter.page, 1);
	const pageSize = Math.min(
		Math.max(filter.pageSize, 1),
		MAX_PROVIDER_PAGE_SIZE
	);
	const [countRow] = await db
		.select({ value: count() })
		.from(aiProviderConfig)
		.where(keywordCondition);
	const items = await db
		.select()
		.from(aiProviderConfig)
		.where(keywordCondition)
		.orderBy(desc(aiProviderConfig.updatedAt), desc(aiProviderConfig.id))
		.limit(pageSize)
		.offset((page - 1) * pageSize);
	return { items, page, pageSize, total: countRow?.value ?? 0 };
}

export async function insertAiProviderConfig(
	input: InsertAiProviderConfigInput
): Promise<AiProviderConfig> {
	const [row] = await db
		.insert(aiProviderConfig)
		.values({
			apiKeyCiphertext: input.apiKeyCiphertext,
			baseUrl: input.baseUrl,
			modelId: input.modelId,
			providerId: input.providerId,
			updatedBy: input.updatedBy,
		})
		.returning();
	if (!row) {
		throw new Error("insertAiProviderConfig: insert returned no row");
	}
	return row;
}

/** 目标行不存在时返回 null（别人刚删掉），由调用方决定怎么翻成 API 错误。 */
export async function updateAiProviderConfig(
	id: string,
	input: UpdateAiProviderConfigInput
): Promise<AiProviderConfig | null> {
	const patch: Record<string, string | null> = {
		baseUrl: input.baseUrl,
		modelId: input.modelId,
		providerId: input.providerId,
		updatedBy: input.updatedBy,
	};
	// 键存在即写，包括显式的 null；键不存在则完全不出现在 SET 子句里。
	if (input.apiKeyCiphertext !== undefined) {
		patch.apiKeyCiphertext = input.apiKeyCiphertext;
	}
	const [row] = await db
		.update(aiProviderConfig)
		.set(patch)
		.where(eq(aiProviderConfig.id, id))
		.returning();
	return row ?? null;
}

/**
 * 删除幂等：行已经不在（另一个标签页先删了）也返回 true，不给前端制造
 * 一条只有刷新才能消掉的报错。返回值只表示「现在库里确实没有这行了」。
 */
export async function deleteAiProviderConfig(id: string): Promise<boolean> {
	const rows = await db
		.delete(aiProviderConfig)
		.where(eq(aiProviderConfig.id, id))
		.returning({ id: aiProviderConfig.id });
	return rows.length > 0;
}
