import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";

/**
 * 消费「重探请求」标记（`farm_node_capability_repository`）。
 *
 * ## 这条路为什么要经过库
 *
 * 按下重探按钮的是管理后台（`packages/api`），而能问出答案的是 farm——只有它
 * 手上有那条 WS。两个进程之间没有直接通道，于是标记落在
 * `farm_nodes.refresh_requested_at` 这一列上，farm 的巡检每轮扫一次。
 * 这比「让 api 去调 farm 的一个内部接口」稳：farm 重启、节点当时不在线、
 * 请求发出去正好赶上巡检——这三种情况下标记都还在，事情迟早会被办掉。
 *
 * ## 离线节点的标记必须留着
 *
 * 一台没连上来的机器是问不出能力的。这时**什么都不做**，标记留在库里，
 * 等它连回来的某一轮再办。清掉标记等于把一次运维请求悄悄扔了，而按下按钮的人
 * 只会看到「探测时间一直没变」，且没有任何地方解释为什么。
 *
 * ## 一台失败不牵连其它
 *
 * 逐台各自 try：一台机器 RPC 超时（60s 那种冷启动，或者半死的连接），
 * 不该让排在它后面的机器这一轮全部轮空。
 */

export interface CapabilityRefreshPort {
	/** 库里被按过重探的节点 id。含离线的——过滤在线不是库该管的事。 */
	listRefreshRequestedNodeIds: () => Promise<string[]>;
	/** 落库。它同时会清掉重探标记（仓储那边是同一条 UPDATE）。 */
	saveNodeCapabilities: (
		id: string,
		capabilities: NodeCapabilities
	) => Promise<void>;
}

export interface CapabilityRefreshDeps {
	control: CapabilityRefreshPort;
	sources: {
		/** 现场重探；null = 这个节点当下不在线（`composite-provider.ts`）。 */
		refreshNodeCapabilities: (
			nodeId: string
		) => Promise<NodeCapabilities | null>;
	};
}

async function refreshOne(
	deps: CapabilityRefreshDeps,
	nodeId: string
): Promise<void> {
	try {
		const capabilities = await deps.sources.refreshNodeCapabilities(nodeId);
		if (capabilities === null) {
			// 不在线：标记留着，等它连回来。
			return;
		}
		await deps.control.saveNodeCapabilities(nodeId, capabilities);
		console.info(`节点 ${nodeId} 能力重探完成`);
	} catch (error) {
		// 标记也留着：探失败与「没探」在运维那边是同一件未办完的事。
		console.warn(`节点 ${nodeId} 能力重探失败`, error);
	}
}

/** 巡检的一轮：把库里排队的重探请求逐台办掉。 */
export async function refreshRequestedCapabilities(
	deps: CapabilityRefreshDeps
): Promise<void> {
	const nodeIds = await deps.control.listRefreshRequestedNodeIds();
	for (const nodeId of nodeIds) {
		// biome-ignore lint/performance/noAwaitInLoops: 逐台串行——重探是分钟级的重活，并发打出去只会同时打扰所有节点
		await refreshOne(deps, nodeId);
	}
}
