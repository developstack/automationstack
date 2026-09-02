import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { FarmNodeView } from "@automationstack/db/schema/farm-nodes";
import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";
import type { ControlMessage } from "@automationstack/farm-node-protocol/control";
import { createMux, type Mux } from "@automationstack/farm-node-protocol/mux";
import { type WebSocket, WebSocketServer } from "ws";

import { HTTP_NOT_FOUND, refuse } from "../cdp/http-refusal";
import type { SessionLifecycleDeps } from "../finalize";
import { syncHelloCapabilities } from "./node-capability-sync";
import { authorizeHello, type NodeDirectoryPort } from "./node-hello";
import { terminateNodeSessions } from "./node-lost";
import { createNodeProvider } from "./node-provider";
import type { SourceRegistry } from "./source-registry";

/**
 * 实机节点的接入口（plan §12）：一条 agent 拨过来的 WS，之上跑控制面 + 数据面。
 *
 * ## 为什么这里是「先升级、再鉴权」，而 `/cdp` 恰恰相反
 *
 * `cdp/proxy.ts` 的纪律是「一定要在升级之前拒绝」，因为它的对面是人和浏览器
 * 客户端，握手之后就只剩一个 close code，用户分不清是没权限还是没槽位。
 *
 * 节点这条路对面是我们自己的 agent，凭据在**第一帧 hello 里**（协议如此设计：
 * token 不进 URL，就不会进任何一层的 access log）。所以只能先把连接升级起来，
 * 再用 `helloReject` 控制帧说明理由——`control.ts` 里那段注释把这条写死了：
 * agent 需要把「token 不对」和「被停用」分开处理，close code 承载不了这个。
 *
 * 于是这里的纪律换成另外两条：
 * 1. **首帧必须是 hello**，`HELLO_TIMEOUT_MS` 内没有就断开——不然一个连上来
 *    什么都不说的连接可以一直占着 fd。
 * 2. 握手通过之前，这条连接**不进注册表**，一个槽位都拿不到。
 */

/** agent 的连接路径。它同时是部署文档里给运维的那一行 URL。 */
export const NODE_CONNECT_PATH = "/nodes/connect";

/** 首帧 hello 的等待窗口。 */
const HELLO_TIMEOUT_MS = 5000;

export interface NodeConnectDeps {
	/** 失联收尾要用同一条收尾流水线（`node-lost.ts`）。 */
	lifecycle: SessionLifecycleDeps;
	nodes: NodeDirectoryPort;
	sources: SourceRegistry;
}

/** 一条已经握完手的节点连接。名字是它在注册表里的键。 */
interface LiveConnection {
	close: () => void;
	name: string;
}

/**
 * 摘掉一条连接：注册表除名 + 它上面的会话全部按 `node_lost` 收尾。
 *
 * **所有权判据是 `live.get(name) === conn`**：关旧迎新之后，旧连接的 close 事件
 * 还会迟到一拍，那时 `name` 这个键已经属于新连接了，不判一下就会把刚接上的
 * 那台机器连同它的会话一起收掉。
 */
function detach(
	deps: NodeConnectDeps,
	live: Map<string, LiveConnection>,
	conn: LiveConnection
): void {
	if (live.get(conn.name) !== conn) {
		return;
	}
	live.delete(conn.name);
	const source = deps.sources.get(conn.name);
	// 先把这台机器上的容器 id 圈出来，再除名——`remove()` 会把容器绑定一起清掉。
	const owned = new Set<string>();
	for (const session of deps.lifecycle.registry.list()) {
		const containerId = session.slot?.containerId;
		if (
			containerId !== undefined &&
			deps.sources.sourceOfContainer(containerId) === source
		) {
			owned.add(containerId);
		}
	}
	deps.sources.remove(conn.name);
	// biome-ignore lint/complexity/noVoid: close 事件回调不能是 async；收尾失败已在内部各自吞掉
	void terminateNodeSessions({
		deps: deps.lifecycle,
		ownsContainer: (containerId) => owned.has(containerId),
	}).then((count) => {
		if (count > 0) {
			console.warn(`节点 ${conn.name} 失联，${count} 条会话按 node_lost 收尾`);
		}
	});
}

interface HandshakeState {
	conn: LiveConnection | null;
}

/** 登记成来源 + 能力落库：共用一个 provider，纠偏重探才打在同一条连接上。 */
function register(
	deps: NodeConnectDeps,
	node: FarmNodeView,
	capabilities: NodeCapabilities,
	mux: Mux
): void {
	const provider = createNodeProvider({
		backend: node.backend,
		mux,
		nodeName: node.name,
	});
	deps.sources.add({
		backend: node.backend,
		capabilities,
		capacity: node.maxSlots,
		kind: "node",
		name: node.name,
		nodeId: node.id,
		provider,
		refresh: provider.detectCapabilities,
	});
	syncHelloCapabilities({
		backend: node.backend,
		capabilities,
		name: node.name,
		nodeId: node.id,
		provider,
		sink: deps.nodes,
		sources: deps.sources,
	});
}

/**
 * hello 通过：应答 → 登记为一个槽位来源。
 *
 * **同名节点已经在线时关旧迎新**（丢旧的、收新的）。这个取舍的依据是两种情形的
 * 相对频率：重连（网络抖动、agent 重启）天天发生，而旧连接十有八九是一条对端
 * 早已消失、只有 farm 这侧还没超时的半死 TCP；两台机器同时用一份凭据则是配置
 * 事故，罕见且本来就该被发现。留旧拒新的话，前一种情形会让那台机器一直连不上，
 * 直到某个不确定的 TCP 超时；关旧迎新的代价则是后一种情形下两台机器互踢——
 * 它吵得很响，正好也就被发现了。这里记一条 warn 就是为了让它吵得见。
 */
function admit(
	deps: NodeConnectDeps,
	live: Map<string, LiveConnection>,
	state: HandshakeState,
	input: {
		capabilities: NodeCapabilities;
		close: () => void;
		mux: Mux;
		node: FarmNodeView;
	}
): void {
	const previous = live.get(input.node.name);
	if (previous !== undefined) {
		console.warn(`节点 ${input.node.name} 重复上线，关掉旧连接改用新的`);
		// 同步摘干净再登记新的：否则旧连接的 close 回调会晚一拍进来，
		// 把新登记的源当成自己的一起收走。
		detach(deps, live, previous);
		previous.close();
	}
	// 先应答再登记：应答写失败（对端已经走了）时，不该有任何会话被派到它头上。
	input.mux.sendControl({
		backend: input.node.backend,
		maxSlots: input.node.maxSlots,
		name: input.node.name,
		nodeId: input.node.id,
		type: "helloAck",
	});
	register(deps, input.node, input.capabilities, input.mux);
	const conn: LiveConnection = { close: input.close, name: input.node.name };
	state.conn = conn;
	live.set(conn.name, conn);
	console.info(
		`节点 ${input.node.name} 上线（backend=${input.node.backend} maxSlots=${input.node.maxSlots}）`
	);
}

/** 心跳落库。失败只记日志：这是一条统计口径，不该反过来掐断一台在干活的机器。 */
function touch(deps: NodeConnectDeps, nodeId: string, name: string): void {
	deps.nodes.touchNodeLastSeen(nodeId).catch((error: unknown) => {
		console.warn(`刷新节点 lastSeen 失败 node=${name}`, error);
	});
}

interface ControlContext {
	close: (reason: string) => void;
	deps: NodeConnectDeps;
	live: Map<string, LiveConnection>;
	mux: Mux;
	state: HandshakeState;
}

async function onNodeSaid(
	ctx: ControlContext,
	message: ControlMessage
): Promise<void> {
	if (message.type === "heartbeat") {
		const source =
			ctx.state.conn === null
				? undefined
				: ctx.deps.sources.get(ctx.state.conn.name);
		if (source !== undefined && source.nodeId !== null) {
			// 每一次心跳都刷 lastSeen：`packages/api` 的在线判定就看这一列。
			touch(ctx.deps, source.nodeId, source.name);
		}
		return;
	}
	if (message.type !== "hello") {
		return;
	}
	if (ctx.state.conn !== null) {
		ctx.close("这条连接已经握过手了");
		return;
	}
	const outcome = await authorizeHello(ctx.deps.nodes, message);
	if (outcome.kind === "reject") {
		console.warn(`拒绝节点接入：${outcome.reason}`);
		ctx.mux.sendControl({ reason: outcome.reason, type: "helloReject" });
		ctx.close(outcome.reason);
		return;
	}
	admit(ctx.deps, ctx.live, ctx.state, {
		capabilities: message.capabilities,
		close: () => ctx.close("被新连接顶掉"),
		mux: ctx.mux,
		node: outcome.node,
	});
	touch(ctx.deps, outcome.node.id, outcome.node.name);
}

/** 接一条已经升级完的 WS：建 mux、等首帧 hello、挂断线收尾。 */
function serveConnection(
	deps: NodeConnectDeps,
	live: Map<string, LiveConnection>,
	ws: WebSocket
): void {
	const state: HandshakeState = { conn: null };
	const close = (reason: string): void => {
		// 用 close 而不是 terminate：helloReject 那一帧要先发出去。
		ws.close(1000, reason.slice(0, 100));
	};
	const mux = createMux({
		handlers: {
			onControl: (message) => {
				// biome-ignore lint/complexity/noVoid: onControl 不能是 async
				void onNodeSaid({ close, deps, live, mux, state }, message).catch(
					(error: unknown) => {
						console.error("处理节点控制帧失败", error);
						ws.terminate();
					}
				);
			},
			onProtocolError: (reason) => {
				console.warn(`节点连接违反协议：${reason}`);
			},
		},
		role: "farm",
		ws,
	});
	const helloTimer = setTimeout(() => {
		if (state.conn === null) {
			console.warn("节点连接在 5 秒内没有发 hello，断开");
			ws.close(1002, "首帧必须是 hello");
		}
	}, HELLO_TIMEOUT_MS).unref();
	ws.on("close", () => {
		clearTimeout(helloTimer);
		if (state.conn !== null) {
			detach(deps, live, state.conn);
		}
	});
}

/**
 * 建 `/nodes/connect` 的升级处理器，交给 `index.ts` 挂到 http server 上。
 *
 * 与 `cdp/proxy.ts` 同款：非本路径的请求回一个**显式的 4xx**（而不是把 socket
 * 一扔），否则对面看到的是「连接莫名其妙断了」，连路径写错了都不知道。
 */
export function createNodeUpgradeHandler(
	deps: NodeConnectDeps
): (request: IncomingMessage, socket: Duplex, head: Buffer) => void {
	const wss = new WebSocketServer({ noServer: true });
	const live = new Map<string, LiveConnection>();
	return (request, socket, head) => {
		const [path] = (request.url ?? "/").split("?");
		if (path !== NODE_CONNECT_PATH) {
			refuse({
				message: `farm 只在 ${NODE_CONNECT_PATH} 上接受节点接入`,
				socket,
				status: HTTP_NOT_FOUND,
			});
			return;
		}
		wss.handleUpgrade(request, socket, head, (ws) => {
			serveConnection(deps, live, ws);
		});
	};
}
