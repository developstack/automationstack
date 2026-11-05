import { AsyncLocalStorage } from "node:async_hooks";

const originStorage = new AsyncLocalStorage<string>();

/**
 * 在 run 中记录本次请求的 origin，例如 https://test.example.com。
 * 本地存储用它生成上传地址和下载地址：浏览器、MCP 客户端和 SDK 都用这个 origin 访问 server。
 */
export function runWithRequestOrigin<T>(
	origin: string | null,
	run: () => T
): T {
	if (origin === null) {
		return run();
	}
	return originStorage.run(origin, run);
}

export function getRequestOrigin(): string | null {
	return originStorage.getStore() ?? null;
}
