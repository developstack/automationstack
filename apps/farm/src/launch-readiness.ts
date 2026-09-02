/**
 * 上游探活：轮询到容器里的 chromedriver / chromium 真的肯应答为止。
 *
 * 从 `launch.ts` 拆出来：那份文件到了 413 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这一段是整条建会话
 * 流水线里唯一**不认识会话**的部分——它不碰状态机、不碰配额、不需要任何注入的
 * 依赖，手上只有一个 HTTP 端点和一个「通了没有」的问题。
 */

/** 上游探活的总上限。超过它就判这个容器起不来，不再等（plan §5.3）。 */
const READY_TIMEOUT_MS = 30_000;

/** 探活轮询间隔。chromedriver 冷启动约 1–3s，250ms 既不空转也不明显拖慢。 */
const READY_POLL_INTERVAL_MS = 250;

/** 单次探活请求的超时。容器起不来时连接会一直挂着，不设它就等于没有轮询。 */
const READY_REQUEST_TIMEOUT_MS = 2000;

/**
 * 单次 GET，带自己的超时。
 *
 * 容器还没监听端口时 fetch 会抛（ECONNREFUSED），端口通了但 chromedriver 还没
 * 起来时会挂着——两种都要在一个轮询周期内回来，否则「30s 上限」会变成
 * 「一次 TCP 超时的长度」。
 */
async function probe(url: string): Promise<Response | null> {
	try {
		return await fetch(url, {
			signal: AbortSignal.timeout(READY_REQUEST_TIMEOUT_MS),
		});
	} catch {
		return null;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms).unref();
	});
}

/**
 * 轮询直到 `read` 给出一个非 null 的值，或者到 30s 上限。
 *
 * 泛型的原因：WebDriver 探的是 `/status` 的 `value.ready`，CDP 探的是
 * `/json/version` 里的 `webSocketDebuggerUrl`——前者只要一个布尔，后者要把那个 URL
 * 带回来。合成「先探活再取值」会多一次往返，且两次往返之间容器可能刚好死掉。
 */
export async function pollUntilReady<T>(
	read: () => Promise<T | null>
): Promise<T | null> {
	const deadline = Date.now() + READY_TIMEOUT_MS;
	for (;;) {
		// biome-ignore lint/performance/noAwaitInLoops: 轮询本来就是串行的——上一次没就绪才有下一次
		const value = await read();
		if (value !== null) {
			return value;
		}
		if (Date.now() >= deadline) {
			return null;
		}
		await sleep(READY_POLL_INTERVAL_MS);
	}
}

/** WebDriver 上游探活：`GET /status` 直到 `value.ready === true`。 */
export async function waitWebDriverReady(endpoint: string): Promise<boolean> {
	const ok = await pollUntilReady(async () => {
		const response = await probe(`${endpoint}/status`);
		if (response === null || !response.ok) {
			return null;
		}
		const body = (await response.json().catch(() => null)) as {
			value?: { ready?: unknown };
		} | null;
		return body?.value?.ready === true ? true : null;
	});
	return ok === true;
}

/**
 * CDP 上游探活：`GET /json/version` 直到拿到 `webSocketDebuggerUrl`。
 *
 * 这一步顺带就是「取 WS 地址」——browser-level 的 WS 端点每次启动都不一样
 * （路径里带一个随机 GUID），不能拼，只能问。
 */
export async function waitCdpDebuggerUrl(
	endpoint: string
): Promise<string | null> {
	return await pollUntilReady(async () => {
		const response = await probe(`${endpoint}/json/version`);
		if (response === null || !response.ok) {
			return null;
		}
		const body = (await response.json().catch(() => null)) as {
			webSocketDebuggerUrl?: unknown;
		} | null;
		const url = body?.webSocketDebuggerUrl;
		return typeof url === "string" && url.length > 0 ? url : null;
	});
}
