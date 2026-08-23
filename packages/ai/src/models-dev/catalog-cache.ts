/**
 * models.dev 目录的抓取与进程内缓存。
 *
 * 为什么必须在服务端抓：原始响应 4.05 MB（brotli 后 296 KB），让每个打开配置页
 * 的浏览器各拉一遍既慢又浪费；解析 7226 条 model 也不该每次请求重做一遍。
 *
 * 刷新姿势：保存响应的 `etag`，TTL 到期后带 `If-None-Match` 重新请求。实测上游
 * 会返回 304 且 body 为空——此时只把有效期往后推，完全跳过 4 MB 下载和解析。
 */
import type { ProviderCatalog } from "./catalog-types";
import { parseCatalog } from "./catalog-types";

const CATALOG_URL = "https://models.dev/api.json";

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/**
 * 6 小时。models.dev 是社区维护的静态目录，新模型上架以天为单位；6 小时既能
 * 保证「今天上架的模型今天就能选到」，又把 revalidate 压到每天 4 次。
 * 命中 304 时这一次几乎零成本，所以没必要为省流量把 TTL 拉更长。
 */
const CATALOG_TTL_MS = 6 * MINUTES_PER_HOUR * MS_PER_MINUTE;

/**
 * 抓取失败后的重试间隔。没有退避的话，配置页每刷新一次就会朝一个已经挂掉的
 * 上游再打一次；5 分钟足够让临时故障自愈，也不会让管理员等太久。
 */
const CATALOG_RETRY_MS = 5 * MS_PER_MINUTE;

/**
 * 单次抓取超时。上游走 Cloudflare，正常一两秒；15 秒是给慢网络留的余量，
 * 超过就宁可先降级返回空列表，也不要把管理员的请求一直挂着。
 */
const FETCH_TIMEOUT_MS = 15_000;

const HTTP_NOT_MODIFIED = 304;

/**
 * - `ready`：数据新鲜；
 * - `stale`：有缓存但刷新失败，仍可用（内容可能落后几小时）；
 * - `unavailable`：从没抓成功过，列表为空——前端据此提示「候选列表暂不可用，
 *   可手工填写 provider / model」，而不是把整个配置页判死。
 */
export type CatalogStatus = "ready" | "stale" | "unavailable";

export interface CatalogSnapshot {
	catalog: ProviderCatalog;
	status: CatalogStatus;
}

interface CatalogState {
	catalog: ProviderCatalog;
	etag: string | null;
	/** 此刻之前都算新鲜；命中 304 时只把它往后推。 */
	freshUntil: number;
}

const EMPTY_CATALOG: ProviderCatalog = new Map();

let state: CatalogState | null = null;
/** 失败退避的解禁时刻；0 表示无退避。 */
let nextAttemptAt = 0;
/** 并发去重：同一时刻只允许一次抓取在飞。 */
let inFlight: Promise<void> | null = null;

/**
 * `HeadersInit` 全局类型在 `lib: ["ESNext"] + types: ["node"]` 下不可见，
 * 从 fetch 的参数类型反推，避免为一个类型名去改全局 lib 配置。
 */
type FetchHeaders = NonNullable<
	NonNullable<Parameters<typeof fetch>[1]>["headers"]
>;

function buildHeaders(etag: string | null): FetchHeaders | undefined {
	return etag === null ? undefined : { "if-none-match": etag };
}

async function fetchCatalog(): Promise<void> {
	const response = await fetch(CATALOG_URL, {
		headers: buildHeaders(state?.etag ?? null),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});

	// 304 的 body 是空的，绝不能去 .json()；续期即可，省下 4 MB 下载与整轮解析。
	if (response.status === HTTP_NOT_MODIFIED && state !== null) {
		state.freshUntil = Date.now() + CATALOG_TTL_MS;
		nextAttemptAt = 0;
		return;
	}

	if (!response.ok) {
		throw new Error(`models.dev responded with ${response.status}`);
	}

	const payload: unknown = await response.json();
	state = {
		catalog: parseCatalog(payload),
		etag: response.headers.get("etag"),
		freshUntil: Date.now() + CATALOG_TTL_MS,
	};
	nextAttemptAt = 0;
}

async function refresh(): Promise<void> {
	try {
		await fetchCatalog();
	} catch {
		// 抓取失败不能让配置页挂掉：退避一段时间，本轮沿用旧缓存或返回空列表。
		// 这里刻意不记录异常内容——上游 URL 与状态码没有诊断价值，且日志噪音大。
		nextAttemptAt = Date.now() + CATALOG_RETRY_MS;
	}
}

function snapshot(): CatalogSnapshot {
	if (state === null) {
		return { catalog: EMPTY_CATALOG, status: "unavailable" };
	}
	return {
		catalog: state.catalog,
		status: Date.now() < state.freshUntil ? "ready" : "stale",
	};
}

/**
 * 取当前目录快照。新鲜就直接返回；过期且不在退避窗口内则先刷新再返回。
 * 任何情况下都不抛异常——调用方拿到的是 status + 可能为空的目录。
 */
export async function getCatalog(): Promise<CatalogSnapshot> {
	const now = Date.now();
	const isFresh = state !== null && now < state.freshUntil;
	if (isFresh || now < nextAttemptAt) {
		return snapshot();
	}
	inFlight ??= refresh().finally(() => {
		inFlight = null;
	});
	await inFlight;
	return snapshot();
}

/** 仅供单测重置模块级缓存。 */
export function resetCatalogCacheForTests(): void {
	state = null;
	nextAttemptAt = 0;
	inFlight = null;
}
