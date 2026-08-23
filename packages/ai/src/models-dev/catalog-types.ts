/**
 * models.dev 目录的解析层。
 *
 * 上游是社区维护的静态 JSON，**没有 API 版本号**，字段是加法式演进，已知
 * `interleaved` 这种字段在不同 provider 下是 bool / object 两种类型混用。
 * 因此这里的原则是「宁可少认，不可整体失败」：
 * - 顶层逐个 provider、provider 内逐个 model 单独 safeParse，坏条目跳过而不是
 *   让 7226 条一起报废；
 * - zod 默认就会**丢弃**未声明的键，所以上游新增字段天然无害，不用 passthrough；
 * - 除 `id` 外所有字段都 optional + `.catch(undefined)`，某个字段换了类型只会
 *   让该字段退化成缺省值。
 */
import { z } from "zod";

/** 单个模型，裁剪到「够管理员挑一个」的最小集合。 */
export interface CatalogModel {
	attachment: boolean;
	/** 上下文窗口 token 上限；上游没给就是 null。 */
	contextLimit: number | null;
	id: string;
	name: string;
	outputLimit: number | null;
	reasoning: boolean;
	releaseDate: string | null;
	toolCall: boolean;
}

export interface CatalogProvider {
	/**
	 * models.dev 的 `api` 字段（OpenAI 兼容端点）。193 个 provider 里只有 167 个
	 * 有——anthropic / openai / google / amazon-bedrock 这些走各自官方 SDK 的
	 * 一线厂商都没有。**没有不等于不支持**：这里如实给 null，由管理员手填，
	 * 绝不因此把 provider 从列表里滤掉。
	 */
	defaultBaseUrl: string | null;
	/** 便于前端直接判断要不要提示「请手工填写 base URL」。 */
	hasDefaultBaseUrl: boolean;
	id: string;
	modelCount: number;
	name: string;
}

export interface CatalogEntry {
	models: CatalogModel[];
	provider: CatalogProvider;
}

/** provider id → 该 provider 的裁剪结果。保序：Map 保留上游的键顺序。 */
export type ProviderCatalog = Map<string, CatalogEntry>;

const optionalNumber = z.number().optional().catch(undefined);
const optionalBoolean = z.boolean().optional().catch(undefined);
const optionalText = z.string().min(1).optional().catch(undefined);

const limitSchema = z
	.object({ context: optionalNumber, output: optionalNumber })
	.optional()
	.catch(undefined);

const modelEntrySchema = z.object({
	attachment: optionalBoolean,
	id: z.string().min(1),
	limit: limitSchema,
	name: optionalText,
	reasoning: optionalBoolean,
	release_date: optionalText,
	tool_call: optionalBoolean,
});

const providerEntrySchema = z.object({
	api: optionalText,
	id: optionalText,
	models: z.record(z.string(), z.unknown()).optional().catch(undefined),
	name: optionalText,
});

/** 顶层是扁平的 provider 字典，没有 `providers` 包裹层，也不是数组。 */
const catalogRootSchema = z.record(z.string(), z.unknown());

/** `modelEntrySchema` 解析成功后的形状，只在本文件内部的取值函数之间传递。 */
type ModelEntry = z.infer<typeof modelEntrySchema>;

/**
 * 取上下文 / 输出的 token 上限。
 *
 * `limit` 整体缺失，或上游把它从对象换成了别的类型（这时 `limitSchema` 的
 * `.catch(undefined)` 已经把它降级成 undefined），两种情况都退化成 null——
 * 少一个上限只是前端少显示一行，让整条模型作废才是真回归。
 */
function readModelLimits(limit: ModelEntry["limit"]): {
	contextLimit: number | null;
	outputLimit: number | null;
} {
	return {
		contextLimit: limit?.context ?? null,
		outputLimit: limit?.output ?? null,
	};
}

/**
 * 取三个能力位（附件 / 推理 / 工具调用）。
 *
 * 缺省和类型漂移一律按「不支持」处理：宁可少认一个能力让管理员自己发现，
 * 也不要凭空宣称支持然后在真正调用时炸掉。
 */
function readModelCapabilities(entry: ModelEntry): {
	attachment: boolean;
	reasoning: boolean;
	toolCall: boolean;
} {
	return {
		attachment: entry.attachment ?? false,
		reasoning: entry.reasoning ?? false,
		toolCall: entry.tool_call ?? false,
	};
}

function toCatalogModel(fallbackId: string, raw: unknown): CatalogModel | null {
	const parsed = modelEntrySchema.safeParse(raw);
	if (!parsed.success) {
		return null;
	}
	const entry = parsed.data;
	const id = entry.id || fallbackId;
	const { contextLimit, outputLimit } = readModelLimits(entry.limit);
	const { attachment, reasoning, toolCall } = readModelCapabilities(entry);
	return {
		attachment,
		contextLimit,
		id,
		name: entry.name ?? id,
		outputLimit,
		reasoning,
		releaseDate: entry.release_date ?? null,
		toolCall,
	};
}

function toCatalogModels(models: Record<string, unknown>): CatalogModel[] {
	const result: CatalogModel[] = [];
	for (const [key, raw] of Object.entries(models)) {
		const model = toCatalogModel(key, raw);
		if (model !== null) {
			result.push(model);
		}
	}
	return result;
}

function toCatalogEntry(key: string, raw: unknown): CatalogEntry | null {
	const parsed = providerEntrySchema.safeParse(raw);
	if (!parsed.success) {
		return null;
	}
	const entry = parsed.data;
	const id = entry.id ?? key;
	const models = toCatalogModels(entry.models ?? {});
	const defaultBaseUrl = entry.api ?? null;
	return {
		models,
		provider: {
			defaultBaseUrl,
			hasDefaultBaseUrl: defaultBaseUrl !== null,
			id,
			modelCount: models.length,
			name: entry.name ?? id,
		},
	};
}

/** 把 models.dev 的原始响应裁剪成进程内缓存的形状；永不抛异常。 */
export function parseCatalog(payload: unknown): ProviderCatalog {
	const root = catalogRootSchema.safeParse(payload);
	if (!root.success) {
		return new Map();
	}
	const catalog: ProviderCatalog = new Map();
	for (const [key, raw] of Object.entries(root.data)) {
		const entry = toCatalogEntry(key, raw);
		if (entry !== null) {
			catalog.set(entry.provider.id, entry);
		}
	}
	return catalog;
}
