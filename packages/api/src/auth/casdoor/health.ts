import type { EffectiveAuthSettings } from "../settings-model";

export type CasdoorReachability =
	| "not-configured"
	| "reachable"
	| "unreachable";

const HEALTH_TIMEOUT_MS = 3000;
/** 探测结果缓存这么久。/health 被频繁调用，不能每次都请求 Casdoor。 */
const HEALTH_CACHE_MS = 30_000;
const DISCOVERY_PATH = "/.well-known/openid-configuration";

let cached: { at: number; result: CasdoorReachability; url: string } | null =
	null;

async function probe(
	url: string,
	doFetch: typeof fetch
): Promise<CasdoorReachability> {
	try {
		const response = await doFetch(url, {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
		});
		await response.body?.cancel();
		return response.ok ? "reachable" : "unreachable";
	} catch {
		return "unreachable";
	}
}

/**
 * /health 中的 Casdoor 状态（plan 021 T13）：集群内地址的发现文档能否访问。
 * 只报告，不让 /health 失败。不是 casdoor 模式时返回 null。
 */
export async function casdoorHealth(
	settings: EffectiveAuthSettings,
	options: { fetch?: typeof fetch; now?: number } = {}
): Promise<CasdoorReachability | null> {
	if (settings.provider !== "casdoor") {
		return null;
	}
	if (!settings.internalUrl) {
		return "not-configured";
	}
	const url = new URL(DISCOVERY_PATH, settings.internalUrl).href;
	const now = options.now ?? Date.now();
	if (cached?.url === url && now - cached.at < HEALTH_CACHE_MS) {
		return cached.result;
	}
	const result = await probe(url, options.fetch ?? fetch);
	cached = { at: now, result, url };
	return result;
}
