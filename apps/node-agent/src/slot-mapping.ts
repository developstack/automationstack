import type { AcquiredSlot } from "@automationstack/browser-slots";
import type { AcquireResult } from "@automationstack/farm-node-protocol/rpc";

/**
 * `@automationstack/browser-slots` 的槽位形态 ↔ 线协议 `rpc.ts` 的载荷形态之间的
 * 全部翻译。**纯函数**，所以这一层的每条规则都能被单测钉住——它也确实需要被钉住：
 * 这里每一个错都表现为「会话建起来了，但 farm 连到了一个不存在的端口」。
 */

/**
 * 端点串 → 端口号。
 *
 * provider 返回的端点**恒为** `http://127.0.0.1:<port>`（本机进程槽位直接拼的，
 * Docker 后端在 published-port + advertiseHost=127.0.0.1 下也是），所以解不出
 * 端口不是「用户输入有问题」，而是**本进程的编程错误**——要么 provider 换了
 * 端点形态，要么 agent 用错了 endpointMode。因此这里抛，让它经 `result.error`
 * 原样出现在 farm 的日志里，而不是回一个 0 或者 null 让错误往下游漂。
 */
export function portFromEndpoint(endpoint: string, label: string): number {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch (error) {
		throw new Error(`${label} 不是合法的 URL：${endpoint}`, { cause: error });
	}
	const port = Number(url.port);
	if (!Number.isInteger(port) || port <= 0) {
		throw new Error(`${label} 里没有可用的端口号：${endpoint}`);
	}
	return port;
}

/**
 * `AcquiredSlot` → `acquire` 的应答。
 *
 * `wdPort` 跟着 `wdEndpoint` 走而不是跟着 mode 走：谁有没有 chromedriver 是
 * provider 说了算的（cdp 模式下它根本没起 chromedriver），照抄它的事实比
 * 按 mode 再推一遍少一次可能对不上的判断。
 *
 * `browserArgs` 要复制一份：契约那边是 `readonly string[]`，线协议这边是
 * 可变数组，直接透传在类型上过不去（也确实不该让协议层拿到 provider 的内部数组）。
 */
export function acquireResultOf(slot: AcquiredSlot): AcquireResult {
	return {
		browserArgs: [...slot.browserArgs],
		cdpDebugPort: slot.cdpDebugPort,
		cdpPort: portFromEndpoint(slot.cdpHttpEndpoint, "CDP 端点"),
		containerId: slot.containerId,
		wdPort:
			slot.wdEndpoint === null
				? null
				: portFromEndpoint(slot.wdEndpoint, "WebDriver 端点"),
	};
}
