/**
 * 目录的查询层：关键词过滤 + 数量上限。
 *
 * 上游有 193 个 provider / 7226 个 model，全量下发给前端既慢又没用，所以过滤和
 * 截断做在服务端，前端只能拿到「它请求的那一小段」。
 */
import type { CatalogStatus } from "./catalog-cache";
import { getCatalog } from "./catalog-cache";
import type { CatalogModel, CatalogProvider } from "./catalog-types";

/**
 * 单次返回的条目上限。193 个 provider 全要也就 193 条，200 足够「不过滤时也能
 * 看到全部 provider」；model 侧最大的 provider 也远不到 200 条。
 * 上限存在的意义是防住「keyword 为空 + limit 传天文数字」把 7226 条一次拖走。
 */
export const MAX_CATALOG_RESULTS = 200;

/** 不传 limit 时的默认条数：一屏下拉框够用，也让首次打开配置页足够快。 */
export const DEFAULT_CATALOG_RESULTS = 50;

export interface CatalogListOptions {
	keyword?: string;
	limit?: number;
}

interface ListEnvelope {
	/** 目录是否可用；`unavailable` 时列表必为空，前端应允许手工填写。 */
	status: CatalogStatus;
	/** 过滤后的总数（截断前），前端据此提示「还有 N 条，请细化关键词」。 */
	total: number;
	truncated: boolean;
}

export interface ProviderListResult extends ListEnvelope {
	providers: CatalogProvider[];
}

export interface ModelListResult extends ListEnvelope {
	/** 选中 provider 的默认 base URL；上游没给就是 null，需要管理员手填。 */
	defaultBaseUrl: string | null;
	models: CatalogModel[];
	/** provider id 在目录里找不到（拼错、或目录不可用）。 */
	providerFound: boolean;
}

function clampLimit(limit: number | undefined): number {
	if (limit === undefined) {
		return DEFAULT_CATALOG_RESULTS;
	}
	return Math.min(Math.max(limit, 1), MAX_CATALOG_RESULTS);
}

function normalizeKeyword(keyword: string | undefined): string {
	return keyword?.trim().toLowerCase() ?? "";
}

function matches(keyword: string, ...fields: string[]): boolean {
	if (keyword === "") {
		return true;
	}
	return fields.some((field) => field.toLowerCase().includes(keyword));
}

function take<T>(items: T[], limit: number): { page: T[]; truncated: boolean } {
	return { page: items.slice(0, limit), truncated: items.length > limit };
}

/** provider 候选列表。没有默认 base URL 的 provider 一样返回，只是标记出来。 */
export async function listCatalogProviders(
	options: CatalogListOptions = {}
): Promise<ProviderListResult> {
	const { catalog, status } = await getCatalog();
	const keyword = normalizeKeyword(options.keyword);
	const filtered: CatalogProvider[] = [];
	for (const entry of catalog.values()) {
		if (matches(keyword, entry.provider.id, entry.provider.name)) {
			filtered.push(entry.provider);
		}
	}
	const { page, truncated } = take(filtered, clampLimit(options.limit));
	return { providers: page, status, total: filtered.length, truncated };
}

export interface ModelListOptions extends CatalogListOptions {
	providerId: string;
}

/** 指定 provider 下的 model 候选列表。 */
export async function listCatalogModels(
	options: ModelListOptions
): Promise<ModelListResult> {
	const { catalog, status } = await getCatalog();
	const entry = catalog.get(options.providerId);
	if (!entry) {
		return {
			defaultBaseUrl: null,
			models: [],
			providerFound: false,
			status,
			total: 0,
			truncated: false,
		};
	}
	const keyword = normalizeKeyword(options.keyword);
	const filtered = entry.models.filter((model) =>
		matches(keyword, model.id, model.name)
	);
	const { page, truncated } = take(filtered, clampLimit(options.limit));
	return {
		defaultBaseUrl: entry.provider.defaultBaseUrl,
		models: page,
		providerFound: true,
		status,
		total: filtered.length,
		truncated,
	};
}
