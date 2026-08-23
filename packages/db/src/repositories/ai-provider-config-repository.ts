import { eq } from "drizzle-orm";

import { db } from "../index";
import type { AiProviderConfig } from "../schema/ai";
import { AI_PROVIDER_CONFIG_ID, aiProviderConfig } from "../schema/ai";

/**
 * 本仓库只搬运密文，不认识明文——加解密发生在 `packages/ai/src/config-store.ts`。
 * 这样「明文 API Key 出现在哪些调用栈里」是可枚举的，审计时不必读整个 db 包。
 */
export interface SaveAiProviderConfigInput {
	/**
	 * 三态：
	 * - `undefined`：保持数据库里已有的密文不动（前端没重填 Key 的常规保存）；
	 * - `null`：显式清空（管理员要求撤销 Key）；
	 * - 字符串：新的密文，覆盖旧值。
	 */
	apiKeyCiphertext?: string | null;
	baseUrl: string;
	modelId: string;
	providerId: string;
	updatedBy: string | null;
}

/** 读取全局唯一那一行；从未配置过时返回 null。 */
export async function getAiProviderConfig(): Promise<AiProviderConfig | null> {
	const [row] = await db
		.select()
		.from(aiProviderConfig)
		.where(eq(aiProviderConfig.id, AI_PROVIDER_CONFIG_ID))
		.limit(1);
	return row ?? null;
}

function buildUpdateSet(
	input: SaveAiProviderConfigInput
): Record<string, string | null> {
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
	return patch;
}

/**
 * 写入全局唯一那一行。
 *
 * 固定主键让「插入或更新」退化成一条 upsert：不需要先 select 再分支，
 * 两个管理员同时保存时由主键仲裁，后到的那条覆盖前一条，不会插出第二行。
 */
export async function saveAiProviderConfig(
	input: SaveAiProviderConfigInput
): Promise<AiProviderConfig> {
	const [row] = await db
		.insert(aiProviderConfig)
		.values({
			apiKeyCiphertext: input.apiKeyCiphertext ?? null,
			baseUrl: input.baseUrl,
			id: AI_PROVIDER_CONFIG_ID,
			modelId: input.modelId,
			providerId: input.providerId,
			updatedBy: input.updatedBy,
		})
		.onConflictDoUpdate({
			set: buildUpdateSet(input),
			target: aiProviderConfig.id,
		})
		.returning();
	if (!row) {
		throw new Error("saveAiProviderConfig: upsert returned no row");
	}
	return row;
}
