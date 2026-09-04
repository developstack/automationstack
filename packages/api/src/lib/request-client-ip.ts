import { AsyncLocalStorage } from "node:async_hooks";

/**
 * 「这个请求从哪个地址来」的按请求透传通道。
 *
 * 存在的理由：oRPC 的 handler 只拿得到 `input` 与 `context`，够不到 Request，
 * 而 `auth.login` 的限流必须按来源地址分桶。地址的**正经归宿是
 * `createContext()` 解析进 `Context`**（和 cookie、secure 同一档），日后有人
 * 动那里时应当把它搬过去、并把这个模块删掉；这里用 AsyncLocalStorage 是同一
 * 件事的一个更窄的实现——它只在 oRPC 分发这一段有值，出了那段就是 null。
 *
 * ⚠️ 谁往里塞值：`apps/server/src/index.ts`，且塞的是 **socket 层**的对端地址，
 * 不是 `X-Forwarded-For`。理由见那里的注释。
 */
const clientIpStorage = new AsyncLocalStorage<string>();

/**
 * 在 `clientIp` 可见的作用域里执行 `run`。
 *
 * `clientIp` 为 null 时不建作用域，`getClientIp()` 因此照旧返回 null——
 * 「取不到地址」必须是一个下游能看见并自行降级的事实，不能被一个假地址盖掉：
 * 拿假地址当真的，等于把所有取不到地址的请求塞进同一个限流桶。
 */
export function runWithClientIp<T>(clientIp: string | null, run: () => T): T {
	if (clientIp === null) {
		return run();
	}
	return clientIpStorage.run(clientIp, run);
}

/** 当前请求的来源地址；不在 oRPC 分发作用域内（或地址取不到）时返回 null。 */
export function getClientIp(): string | null {
	return clientIpStorage.getStore() ?? null;
}
