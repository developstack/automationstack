import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { FarmNodeView } from "@automationstack/db/schema/farm-nodes";
import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";

import { type Harness, makeHarness } from "../finalize-test-harness";
import { createNodeUpgradeHandler, NODE_CONNECT_PATH } from "./node-connect";
import { createSourceRegistry, type SourceRegistry } from "./source-registry";

/**
 * 节点接入用例的 farm 那一侧：一个**真的** http server + 真的升级处理器。
 *
 * 只有「库」是假的（一张内存里的 token → 节点行的表）。这条分界与
 * `finalize-test-harness.ts` 是同一条：进程内能跑的东西一律跑真的，跨进程的
 * 依赖（Postgres、Docker、R2）才换成假的。
 */

export interface NodeAccount {
	node: FarmNodeView;
	/** 明文凭据。真实路径上它只出现在 hello 帧里，这里同样如此。 */
	token: string;
}

export function makeNode(options: {
	backend?: "docker" | "local";
	enabled?: boolean;
	maxSlots?: number;
	name: string;
	token: string;
}): NodeAccount {
	return {
		node: {
			backend: options.backend ?? "local",
			// 库里那两列由「能力入库」那一波负责写；握手用例只关心 hello 有没有
			// 把快照带上来，所以这里给 null（一台还没报过能力的新节点就是这样）。
			capabilities: null,
			capabilitiesUpdatedAt: null,
			createdAt: new Date(0),
			enabled: options.enabled ?? true,
			id: `00000000-0000-0000-0000-${options.name.padStart(12, "0").slice(-12)}`,
			lastSeenAt: null,
			maxSlots: options.maxSlots ?? 2,
			name: options.name,
			refreshRequestedAt: null,
		},
		token: options.token,
	};
}

/** 一次「能力落库」调用，用来断言握手确实把清单写下去了。 */
export interface SavedCapabilities {
	capabilities: NodeCapabilities;
	id: string;
}

export interface NodeTestFarm {
	close: () => Promise<void>;
	harness: Harness;
	/** 落库过的能力清单（假仓储收下的那些）。 */
	saved: SavedCapabilities[];
	sources: SourceRegistry;
	/** 每次心跳/握手刷 lastSeen 的节点 id，用来断言「心跳确实落到了库上」。 */
	touched: string[];
	/** `ws://127.0.0.1:<port>/nodes/connect`。 */
	url: string;
}

/** 假的节点库：认 token、记心跳、收能力清单，三样都只落在内存里。 */
function fakeDirectory(
	accounts: NodeAccount[],
	touched: string[],
	saved: SavedCapabilities[]
) {
	return {
		findNodeByToken: (token: string) =>
			Promise.resolve(
				accounts.find((account) => account.token === token)?.node ?? null
			),
		saveNodeCapabilities: (id: string, capabilities: NodeCapabilities) => {
			saved.push({ capabilities, id });
			return Promise.resolve();
		},
		touchNodeLastSeen: (id: string) => {
			touched.push(id);
			return Promise.resolve();
		},
	};
}

export function startFarmForNodes(
	accounts: NodeAccount[]
): Promise<NodeTestFarm> {
	const harness = makeHarness();
	const sources = createSourceRegistry();
	const touched: string[] = [];
	const saved: SavedCapabilities[] = [];
	const handleUpgrade = createNodeUpgradeHandler({
		lifecycle: harness.deps,
		nodes: fakeDirectory(accounts, touched, saved),
		sources,
	});
	const server = createServer((_request, response) => {
		response.statusCode = 404;
		response.end();
	});
	server.on("upgrade", handleUpgrade);

	return new Promise<NodeTestFarm>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address() as AddressInfo | null;
			if (address === null) {
				reject(new Error("测试 farm 拿不到端口"));
				return;
			}
			resolve({
				close: () =>
					new Promise<void>((done) => {
						// 升级过的 socket 不受 close() 管，不主动掐掉的话用例会挂住。
						server.closeAllConnections();
						server.close(() => done());
					}),
				harness,
				saved,
				sources,
				touched,
				url: `ws://127.0.0.1:${address.port}${NODE_CONNECT_PATH}`,
			});
		});
	});
}
