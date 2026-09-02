import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";
import type {
	ControlMessage,
	NodeBackend,
} from "@automationstack/farm-node-protocol/control";
import { createMux, type Mux } from "@automationstack/farm-node-protocol/mux";
import type { WebSocket } from "ws";

import type { CapabilityDetector } from "./capabilities";
import { attachLocalSocket } from "./local-stream";
import { type AgentLogger, describeError } from "./logger";
import type { ProviderFactory } from "./provider-factory";
import { createSlotService, type SlotService } from "./slot-service";

/**
 * **一次连接**的完整生命周期：拨号 → hello → helloAck → 服务 → 断开。
 *
 * 重连不在这里（`agent.ts` 负责），所以这个文件里没有任何「再来一次」的逻辑——
 * 它只回答一个问题：这次连接以什么方式结束，以及**还该不该再试**。
 *
 * 一条纪律贯穿全文：**握手完成之前不接受任何指令**。`onCall` 在 `service` 为 null
 * 时直接拒绝——farm 侧不会在 ack 之前下发 call，但「对端不会这么干」不是我们
 * 敢不敢裸奔的理由，节点 token 是发给别人的机器的。
 */

/** 等 helloAck 的上限。超时按可重试处理：多半是 farm 正在重启。 */
const HELLO_TIMEOUT_MS = 15_000;

export interface SessionDeps {
	agentVersion: string;
	/** 本机探测出来的后端能力，如实写进 hello。 */
	backends: NodeBackend[];
	/** 启动时探到的浏览器能力快照，原样写进 hello（`capabilities.ts`）。 */
	capabilities: NodeCapabilities;
	connectUrl: string;
	createProvider: ProviderFactory;
	/** 现探现报，供 `detectCapabilities` RPC。后端在 helloAck 之后才绑得上。 */
	detectCapabilities: CapabilityDetector;
	heartbeatIntervalMs: number;
	logger: AgentLogger;
	openWebSocket: (url: string) => WebSocket;
	/** 关停信号。abort 之后本次连接以 `stopped` 收场（仍然会先释放槽位）。 */
	signal: AbortSignal;
	token: string;
}

export interface SessionOutcome {
	/** 这次连接有没有握手成功过。`agent.ts` 用它决定要不要把退避计数清零。 */
	connected: boolean;
	kind: "fatal" | "retry" | "stopped";
	reason: string;
}

interface SessionState {
	acked: boolean;
	deps: SessionDeps;
	heartbeat: NodeJS.Timeout | null;
	helloTimer: NodeJS.Timeout | null;
	mux: Mux | null;
	onAbort: () => void;
	resolve: (outcome: SessionOutcome) => void;
	service: SlotService | null;
	settled: boolean;
	ws: WebSocket;
}

/**
 * 收摊。**先释放全部活动槽位，再 resolve**。
 *
 * 顺序不能反，理由是 farm 那边的判定：连接一断，这个节点上的 running 会话
 * 立刻被判 `failed(reason=node_lost)`（plan §12——数据面隧道已随连接死，
 * 不存在「还活着」的会话）。也就是说这些浏览器进程再没有任何人会来收，
 * 留着它们纯粹是泄漏。
 */
function finish(state: SessionState, outcome: SessionOutcome): void {
	if (state.settled) {
		return;
	}
	state.settled = true;
	state.deps.signal.removeEventListener("abort", state.onAbort);
	if (state.heartbeat !== null) {
		clearInterval(state.heartbeat);
	}
	if (state.helloTimer !== null) {
		clearTimeout(state.helloTimer);
	}
	const { service } = state;
	state.service = null;
	const done = (): void => {
		state.ws.close();
		state.resolve({ ...outcome, connected: state.acked });
	};
	if (service === null) {
		done();
		return;
	}
	// biome-ignore lint/complexity/noVoid: releaseAll 自己吞掉失败，两支都走 done
	void service.releaseAll(outcome.reason).then(done, done);
}

/**
 * 平台登记的后端与本机探到的能力对不上。这是**配置错**，重连一万次也不会变，
 * 所以直接 fatal，并且把话说到能照着办的程度。
 */
function backendMismatch(state: SessionState, backend: NodeBackend): string {
	const detail =
		backend === "docker"
			? "但本机探测不到 Docker daemon（检查 daemon 是否在跑、当前用户有没有权限、NODE_AGENT_DOCKER_HOST 是否指对）"
			: "但本机没有上报 local 后端能力";
	return `此节点在平台上登记为 ${backend} 后端，${detail}。本机可用后端：${state.deps.backends.join("、")}`;
}

function startHeartbeat(state: SessionState, service: SlotService): void {
	// 30 秒一拍。平台按 90 秒窗口判离线（`packages/api/src/lib/farm-node-online.ts`
	// 的 `NODE_ONLINE_WINDOW_MS`，容三拍），所以这个间隔与那边的
	// `NODE_HEARTBEAT_INTERVAL_MS` 是**同一个约定的两份副本**，改一边必须改另一边。
	state.heartbeat = setInterval(() => {
		state.mux?.sendControl({
			activeSlots: service.activeCount(),
			type: "heartbeat",
		});
	}, state.deps.heartbeatIntervalMs);
}

function onHelloAck(
	state: SessionState,
	ack: Extract<ControlMessage, { type: "helloAck" }>
): void {
	if (state.acked) {
		state.deps.logger.warn("收到重复的 helloAck，忽略");
		return;
	}
	if (!state.deps.backends.includes(ack.backend)) {
		finish(state, {
			connected: false,
			kind: "fatal",
			reason: backendMismatch(state, ack.backend),
		});
		return;
	}
	let service: SlotService;
	try {
		service = createSlotService({
			backend: ack.backend,
			// 绑平台登记的后端而不是 hello 里报的那个（两者可以不同，见
			// `capabilities.ts` 的 `preferredBackend`）：重新探测问的是它正在当什么用。
			detectCapabilities: () => state.deps.detectCapabilities(ack.backend),
			logger: state.deps.logger,
			maxSlots: ack.maxSlots,
			provider: state.deps.createProvider(ack.backend),
		});
	} catch (error) {
		// provider 建不起来（docker host 串写坏了之类）同样是配置错，不该重连。
		finish(state, {
			connected: false,
			kind: "fatal",
			reason: `${ack.backend} 后端初始化失败：${describeError(error)}`,
		});
		return;
	}
	state.acked = true;
	state.service = service;
	if (state.helloTimer !== null) {
		clearTimeout(state.helloTimer);
		state.helloTimer = null;
	}
	startHeartbeat(state, service);
	state.deps.logger.info(
		`已接入平台：节点 ${ack.name}（${ack.nodeId}），后端 ${ack.backend}，槽位上限 ${ack.maxSlots}`
	);
}

function handleControl(state: SessionState, message: ControlMessage): void {
	if (message.type === "helloAck") {
		onHelloAck(state, message);
		return;
	}
	if (message.type === "helloReject") {
		// 拒绝一律 fatal：farm 是**看过凭据之后**做的决定（token 不对、节点被停用、
		// 版本太老），这三种重连一万次都是同一个答案。真正该重连的是**连不上**，
		// 那条路走的是 ws 的 error/close，不经过这里。
		finish(state, {
			connected: false,
			kind: "fatal",
			reason: `平台拒绝握手：${message.reason}`,
		});
	}
}

function callService(
	state: SessionState,
	method: Parameters<SlotService["handleCall"]>[0],
	params: unknown
): Promise<unknown> {
	const { service } = state;
	if (service === null) {
		return Promise.reject(new Error("尚未完成握手，不接受任何指令"));
	}
	return service.handleCall(method, params);
}

function sendHello(state: SessionState): void {
	state.mux?.sendControl({
		agentVersion: state.deps.agentVersion,
		backends: state.deps.backends,
		capabilities: state.deps.capabilities,
		token: state.deps.token,
		type: "hello",
	});
	state.helloTimer = setTimeout(() => {
		finish(state, {
			connected: false,
			kind: "retry",
			reason: `发出 hello 后 ${HELLO_TIMEOUT_MS}ms 没等到应答`,
		});
	}, HELLO_TIMEOUT_MS);
}

/** 挂 mux。单独一个函数只是为了让 `runSession` 短到一眼能看完，没有别的语义。 */
function wireMux(state: SessionState): Mux {
	return createMux({
		handlers: {
			onCall: (method, params) => callService(state, method, params),
			onControl: (message) => {
				handleControl(state, message);
			},
			onOpenStream: (streamId, port) => {
				if (state.mux !== null) {
					attachLocalSocket({
						logger: state.deps.logger,
						mux: state.mux,
						port,
						streamId,
					});
				}
			},
			onProtocolError: (message) => {
				state.deps.logger.error(`线协议错误：${message}`);
			},
		},
		role: "node",
		ws: state.ws,
	});
}

/** socket 的三个出口：连上了发 hello，出错与关闭都按可重试收场。 */
function wireSocket(state: SessionState): void {
	state.ws.on("open", () => {
		sendHello(state);
	});
	state.ws.on("error", (error: Error) => {
		finish(state, {
			connected: false,
			kind: "retry",
			reason: `连接出错：${describeError(error)}`,
		});
	});
	state.ws.on("close", () => {
		finish(state, { connected: false, kind: "retry", reason: "连接已关闭" });
	});
}

export function runSession(deps: SessionDeps): Promise<SessionOutcome> {
	return new Promise<SessionOutcome>((resolve) => {
		const state: SessionState = {
			acked: false,
			deps,
			heartbeat: null,
			helloTimer: null,
			mux: null,
			onAbort: () => undefined,
			resolve,
			service: null,
			settled: false,
			ws: deps.openWebSocket(deps.connectUrl),
		};
		state.onAbort = () => {
			finish(state, {
				connected: false,
				kind: "stopped",
				reason: "收到停止信号",
			});
		};
		state.mux = wireMux(state);
		deps.signal.addEventListener("abort", state.onAbort, { once: true });
		wireSocket(state);
		// 拨号之前就已经 abort 的情况（stop 与启动撞在一起）：abort 事件不会再来
		// 一次，这里补一脚，否则这条连接会一直挂着等一个永远不到的信号。
		if (deps.signal.aborted) {
			state.onAbort();
		}
	});
}
