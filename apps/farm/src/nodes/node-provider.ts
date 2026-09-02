import type {
	AcquiredSlot,
	AcquireSlotInput,
	ManagedContainer,
	SlotProvider,
} from "@automationstack/browser-slots";
import { parseImageBrowser } from "@automationstack/browser-slots";
import {
	type NodeBackend,
	type NodeCapabilities,
	nodeCapabilitiesSchema,
} from "@automationstack/farm-node-protocol/capabilities";
import type { Mux } from "@automationstack/farm-node-protocol/mux";
import {
	type AcquireResult,
	acquireResultSchema,
	listManagedResultSchema,
	readLogsResultSchema,
} from "@automationstack/farm-node-protocol/rpc";

import { type LoopbackRelay, startLoopbackRelay } from "./node-tunnel";

/**
 * 一台实机节点的 `SlotProvider` 实现：**把 SlotProvider 的每个方法翻成一次 RPC**
 * （plan §12 / rpc.ts 的方法表）。
 *
 * 它与 Docker / Local 两个实现是平级的第三种后端。区别只在数据面：那两个的端口
 * 就在 farm 本机，而这个的端口在另一台机器上，所以 `acquire` 回来之后要多做一步
 * ——给用得上的端口各开一条回环中继（`node-tunnel.ts`），再把中继端口拼成 URL
 * 交出去。交出去之后，上面的转发、代理、recorder 一个字都不用改。
 *
 * 对端的返回值**逐个过 zod**（`acquireResultSchema` 等）。对端是另一台机器上的
 * 另一个版本的 agent，「我这边类型对」在这条链路上不构成证据。
 */

/**
 * `acquire` 的超时。默认的 30s 不够：实机上第一次拉起一个浏览器要装 profile、
 * 起 chromedriver，冷启动过分钟并不稀奇。这个值与 mux 的 `DEFAULT_CALL_TIMEOUT_MS`
 * 是两回事，后者管的是「列一下容器」那种应当立刻回来的调用。
 */
const ACQUIRE_TIMEOUT_MS = 60_000;

export interface NodeProviderOptions {
	/**
	 * 这台节点**登记**的后端（helloAck 里发下去的那个），决定要不要给它下发镜像。
	 * 不用 agent 自报的 `capabilities.backend`：那是 agent 按「docker 优先」挑的，
	 * 与登记的可以不一致，而下发什么必须跟着登记走——否则一台按 local 借出去的
	 * 机器会收到一个它根本不会用的 tag。
	 */
	backend: NodeBackend;
	mux: Mux;
	/** 只用于日志与错误消息，让「哪台机器出的事」在一行里就能看出来。 */
	nodeName: string;
}

interface SlotRelays {
	cdp: LoopbackRelay;
	wd: LoopbackRelay | null;
}

async function closeRelays(relays: SlotRelays): Promise<void> {
	await relays.cdp.close();
	if (relays.wd !== null) {
		await relays.wd.close();
	}
}

/**
 * 给这个槽位开中继。
 *
 * CDP 端口恒开：WebDriver 模式下 recorder 也要挂 CDP（D5）。WebDriver 端口只在
 * 节点报了 `wdPort` 时开——`mode: "cdp"` 那条路上节点根本没起 chromedriver。
 */
async function openRelays(
	mux: Mux,
	result: AcquireResult
): Promise<SlotRelays> {
	const cdp = await startLoopbackRelay({ mux, nodePort: result.cdpPort });
	if (result.wdPort === null) {
		return { cdp, wd: null };
	}
	try {
		const wd = await startLoopbackRelay({ mux, nodePort: result.wdPort });
		return { cdp, wd };
	} catch (error) {
		// 第二个开不起来时第一个已经在监听了，不收就是一个永远泄漏的端口。
		await cdp.close();
		throw error;
	}
}

function buildSlot(
	options: NodeProviderOptions,
	result: AcquireResult,
	relays: SlotRelays
): AcquiredSlot {
	let released = false;
	return {
		browserArgs: result.browserArgs,
		/**
		 * **节点本机的**调试端口，不是中继端口：它会被 WebDriver 侧注入成
		 * `--remote-debugging-port`，那个参数是在节点那台机器上生效的。
		 */
		cdpDebugPort: result.cdpDebugPort,
		cdpHttpEndpoint: `http://127.0.0.1:${relays.cdp.port}`,
		containerId: result.containerId,
		readLogs: async () => {
			const raw = await options.mux.call("readLogs", {
				containerId: result.containerId,
			});
			return readLogsResultSchema.parse(raw).logs;
		},
		release: async () => {
			// 幂等（契约要求）：reaper 与正常收尾会并发调它。
			if (released) {
				return;
			}
			released = true;
			// 先收中继再通知节点：反过来的话，节点已经把浏览器杀了，而中继还在
			// 接客户端连接，客户端会拿到一串莫名其妙的 ECONNRESET 而不是干净的
			// 「连不上」。
			await closeRelays(relays);
			await options.mux.call("release", { containerId: result.containerId });
		},
		wdEndpoint:
			relays.wd === null ? null : `http://127.0.0.1:${relays.wd.port}`,
	};
}

/** 节点 provider 比 `SlotProvider` 多一个能力探测（rpc.ts 里的第六个方法）。 */
export interface NodeSlotProvider extends SlotProvider {
	detectCapabilities: () => Promise<NodeCapabilities>;
}

export function createNodeProvider(
	options: NodeProviderOptions
): NodeSlotProvider {
	const acquire = async (input: AcquireSlotInput): Promise<AcquiredSlot> => {
		// 上游给了浏览器就用上游的，没给才从镜像 tag 反解。反解那条路是**兜底**
		// 而不是主路：目录行里本来就有 browser/version 两列，farm 是从它们推出
		// 镜像的，再从镜像推回去等于绕一圈还可能失真（`parseImageBrowser` 的注释）。
		const request =
			input.browserName === undefined
				? parseImageBrowser(input.image)
				: {
						browserName: input.browserName,
						browserVersion: input.browserVersion ?? null,
					};
		const raw = await options.mux.call(
			"acquire",
			{
				browserName: request.browserName,
				browserVersion: request.browserVersion,
				expiresAtEpochSec: input.expiresAtEpochSec,
				// docker 后端要拿它去 pull/run，猜不得（rpc.ts）；local 后端下 null，
				// 因为它的浏览器是本机探出来的，镜像库里未必有对应的行。
				image: options.backend === "docker" ? input.image : null,
				mode: input.mode,
				sessionId: input.sessionId,
			},
			ACQUIRE_TIMEOUT_MS
		);
		const result = acquireResultSchema.parse(raw);
		try {
			const relays = await openRelays(options.mux, result);
			return buildSlot(options, result, relays);
		} catch (error) {
			// 槽位已经在节点上起来了，中继却没开成——不回收的话它会一直挂到过期
			// （agent 侧自己的计时会兜底，但那是分钟级的浪费）。
			await options.mux
				.call("release", { containerId: result.containerId })
				.catch(() => {
					// 已经失败一次的连接上再失败一次，没有新信息。
				});
			throw error;
		}
	};

	return {
		acquire,
		/**
		 * 现场重探。不在 `SlotProvider` 里（rpc.ts 里写明它是唯一的例外），
		 * 所以挂在返回值上、由 `node-connect.ts` 摘下来交给源当 `refresh`。
		 */
		detectCapabilities: async (): Promise<NodeCapabilities> => {
			const raw = await options.mux.call("detectCapabilities", {});
			return nodeCapabilitiesSchema.parse(raw);
		},
		listManagedContainers: async (): Promise<ManagedContainer[]> => {
			const raw = await options.mux.call("listManaged", {});
			// `ManagedSlot` 与 `ManagedContainer` 是同构的（rpc.ts 里写死了这条），
			// 所以这里不需要字段搬运。
			return listManagedResultSchema.parse(raw);
		},
		releaseContainer: async (containerId: string): Promise<void> => {
			await options.mux.call("releaseContainer", { containerId });
		},
	};
}
