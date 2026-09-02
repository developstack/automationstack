/**
 * 问出 browser-level 的 CDP WebSocket 地址。
 *
 * 从 `client.ts` 拆出来：那份文件到了 435 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这是 recorder 里
 * 唯一一处走 HTTP（而不是 CDP 帧）的调用，超时与错误信息都自成一套；
 * 挂载重试的策略则留在 `client.ts`，两者的失败语义不该缠在一起。
 */

import { isRecord, readString } from "./cdp-param-readers";

const TRAILING_SLASHES = /\/+$/;
const VERSION_FETCH_TIMEOUT_MS = 5000;

/**
 * 浏览器容器只暴露 HTTP 端点，browser-level 的 WS 地址（带 guid）必须现问现取：
 * 它每次启动都不一样，写死不了。
 */
export const fetchBrowserWebSocketUrl = async (
	httpEndpoint: string
): Promise<string> => {
	const base = httpEndpoint.replace(TRAILING_SLASHES, "");
	const response = await fetch(`${base}/json/version`, {
		signal: AbortSignal.timeout(VERSION_FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`/json/version 返回 ${response.status}`);
	}
	const payload: unknown = await response.json();
	const wsUrl = isRecord(payload)
		? readString(payload, "webSocketDebuggerUrl")
		: undefined;
	if (!wsUrl) {
		throw new Error("/json/version 没有 webSocketDebuggerUrl");
	}
	return wsUrl;
};
