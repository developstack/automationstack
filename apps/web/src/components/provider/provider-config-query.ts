/**
 * `/ai-provider` 登记表列表的查询输入与页数换算。
 *
 * 与 case-list-query.ts 同一分工：路由 loader（预取第一页）与页面组件用同一个
 * 函数产出 query input，两边的 queryKey 才能严格对上——loader 想省一次请求，
 * 靠的就是页面组件第一次查询命中它预取的那份缓存。
 */

/** 登记行比用例行信息密度低（没有标签/优先级），一页 10 行足够扫读。 */
export const PROVIDER_PAGE_SIZE = 10;

export interface ProviderListInput {
	keyword: string | undefined;
	page: number;
	pageSize: number;
}

export function providerListInput(
	keyword: string,
	page: number
): ProviderListInput {
	const trimmed = keyword.trim();
	return {
		keyword: trimmed === "" ? undefined : trimmed,
		page,
		pageSize: PROVIDER_PAGE_SIZE,
	};
}

/** Total pages for `total` rows, at least 1 so the paginator never disappears. */
export function providerPageCount(total: number): number {
	return Math.max(Math.ceil(total / PROVIDER_PAGE_SIZE), 1);
}
