import type { FarmNodeView } from "@automationstack/db/schema/farm-nodes";
import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";

/** agent 上线第一帧里我们要看的那几项（`control.ts` 的 `helloSchema`）。 */
export interface HelloClaims {
	backends: readonly ("docker" | "local")[];
	token: string;
}

export interface NodeDirectoryPort {
	/**
	 * 按明文 token 找节点。**返回值不过滤 `enabled`**——那正是下面三种拒绝理由
	 * 能分开说的前提（`farm-node-repository.findNodeByToken` 的注释写死了这条）。
	 */
	findNodeByToken: (token: string) => Promise<FarmNodeView | null>;
	/** 把握手/重探得到的能力清单写进档案（`node-capability-sync.ts` 讲了为什么要存）。 */
	saveNodeCapabilities: (
		id: string,
		capabilities: NodeCapabilities
	) => Promise<void>;
	touchNodeLastSeen: (id: string) => Promise<void>;
}

export type HelloOutcome =
	| { kind: "ok"; node: FarmNodeView }
	| { kind: "reject"; reason: string };

/**
 * 握手鉴权。**三种失败必须说成三句不同的话**，因为 agent 与运维要做的事完全不同：
 *
 * - 凭据无效 → 配置错了或凭据被轮换过，agent 该报错退出让人去后台看；
 * - 已停用 → 这是运维**故意**按下的，agent 该安静退避重试，而不是刷告警；
 * - 后端不匹配 → 这台机器登记时选的后端和它实际能提供的对不上（比如登记成
 *   docker 但机器上没有 daemon）。这是最容易被误诊成「凭据不对」的一种，
 *   合并进上面任何一句都会让人往错误的方向查半天。
 *
 * 后端不匹配为什么必须拦在这里而不是等第一次 acquire 失败：`backend` 决定的是
 * **复位纪律**（销毁容器 vs 杀进程树 + 删 profile），登记与实际不符时，
 * 收尾会按错误的方式做，而那种错误不会当场报错，只会留下永远收不掉的残留。
 */
export async function authorizeHello(
	nodes: NodeDirectoryPort,
	hello: HelloClaims
): Promise<HelloOutcome> {
	const node = await nodes.findNodeByToken(hello.token);
	if (node === null) {
		return { kind: "reject", reason: "节点凭据无效" };
	}
	if (!node.enabled) {
		return { kind: "reject", reason: `节点已停用（${node.name}）` };
	}
	if (!hello.backends.includes(node.backend)) {
		return {
			kind: "reject",
			reason: `节点登记为 ${node.backend} 后端但对端不支持（它声称支持：${hello.backends.join("、")}）`,
		};
	}
	return { kind: "ok", node };
}
