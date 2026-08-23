/**
 * models.dev 候选目录的查询层。
 *
 * 过滤与截断都在服务端做（193 个 provider / 7226 个 model 全量下发既慢又没用），
 * 这一层只负责三件事：把击键防抖成一次请求、把响应拍平成下拉项、把「目录不可用」
 * 翻译成一个布尔量。真正的降级动作（切成手工填写）留给上层决定——这里不做决策，
 * 否则「目录暂时抓不到」和「用户就是想手填一个内网地址」会被搅成同一件事。
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { orpc } from "@/utils/orpc";

/** 与 case-filters.tsx 的搜索框同一个节奏：全站击键防抖只有这一个数。 */
const KEYWORD_DEBOUNCE_MS = 300;

/** 关键词跟着击键走，请求跟着这个值走。 */
export function useDebouncedValue(value: string): string {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), KEYWORD_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [value]);

	return debounced;
}

export interface CatalogOption {
	label: string;
	value: string;
}

export interface ProviderOption extends CatalogOption {
	/** 上游没给 OpenAI 兼容端点时为 null，选中它就得由管理员自己填 base URL。 */
	defaultBaseUrl: string | null;
}

export interface CatalogQueryResult<TOption extends CatalogOption> {
	loading: boolean;
	options: TOption[];
	/** 过滤后的总数（截断前），用来提示「还有多少条没显示」。 */
	total: number;
	truncated: boolean;
	/** 目录从没抓成功过：列表恒为空，上层必须放行手工填写。 */
	unavailable: boolean;
}

/** 名称和 id 常常不一样（`Anthropic` / `anthropic`），两个都摆出来才对得上搜索词。 */
function toLabel(id: string, name: string): string {
	return name === id ? id : `${name} · ${id}`;
}

export function useProviderOptions(
	keyword: string
): CatalogQueryResult<ProviderOption> {
	const debounced = useDebouncedValue(keyword);
	const query = useQuery(
		orpc.aiProviderConfig.listProviders.queryOptions({
			input: { keyword: debounced },
		})
	);
	const { data } = query;
	const options = useMemo(
		() =>
			(data?.providers ?? []).map((provider) => ({
				defaultBaseUrl: provider.defaultBaseUrl,
				label: toLabel(provider.id, provider.name),
				value: provider.id,
			})),
		[data]
	);

	return {
		// 用 isFetching 而不是 isPending：关键词一变就是一把新 queryKey，
		// 旧数据不再命中，此时正在飞的那次请求必须被说成「加载中」。
		loading: query.isFetching,
		options,
		total: data?.total ?? 0,
		truncated: data?.truncated ?? false,
		unavailable: data?.status === "unavailable",
	};
}

export function useModelOptions(
	providerId: string,
	keyword: string
): CatalogQueryResult<CatalogOption> {
	const debounced = useDebouncedValue(keyword);
	const query = useQuery({
		...orpc.aiProviderConfig.listModels.queryOptions({
			input: { keyword: debounced, providerId },
		}),
		// provider 还没选定时这条查询没有意义，空串也过不了服务端的 min(1)
		enabled: providerId !== "",
	});
	const { data } = query;
	const options = useMemo(
		() =>
			(data?.models ?? []).map((model) => ({
				label: toLabel(model.id, model.name),
				value: model.id,
			})),
		[data]
	);

	return {
		loading: query.isFetching,
		options,
		total: data?.total ?? 0,
		truncated: data?.truncated ?? false,
		// providerFound 为 false 只可能是目录不可用或 id 手打错了，两种都得放行手填
		unavailable: data?.status === "unavailable",
	};
}
