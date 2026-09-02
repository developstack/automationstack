import type { Duplex } from "node:stream";
import type { WebSocket } from "ws";

import type { ControlMessage } from "./control";
import { isValidStreamId } from "./frame";
import { handleDisconnect, handleMessage } from "./mux-inbound";
import type { MuxStream } from "./mux-stream";
import { pipeStreamToSocket } from "./mux-stream";
import {
	createMuxState,
	DISCONNECT_REASON,
	isOpen,
	type MuxHandlers,
	type MuxRole,
	type MuxState,
	registerStream,
	sendControl,
} from "./mux-transport";
import type { FarmRpcMethod } from "./rpc";

/**
 * 复用器：把一条 WebSocket 变成「一个 RPC 通道 + 任意多条字节流」。
 *
 * farm 与 node-agent **跑的是同一份实现**，只有 `role` 不同——它决定用哪张 schema
 * 解对端的控制帧（`control.ts`），除此之外两侧完全对称。
 *
 * ```ts
 * // farm 侧（收到 agent 拨过来的连接之后）
 * const mux = createMux({ role: "farm", ws, handlers: { onControl: onAgentSaid } });
 * const slot = acquireResultSchema.parse(
 *   await mux.call("acquire", acquireParams, 60_000)
 * );
 * const cdp = mux.openStream(slot.cdpPort); // 一个 Duplex，接进既有数据面
 *
 * // agent 侧（拨向 farm）
 * const mux = createMux({
 *   role: "node",
 *   ws,
 *   handlers: {
 *     onCall: (method, params) => runProviderMethod(method, params),
 *     onOpenStream: (streamId, port) => {
 *       const socket = net.connect(port, "127.0.0.1");
 *       mux.attachStream(streamId, socket);
 *     },
 *   },
 * });
 * mux.sendControl({ type: "hello", token, backends: ["local"], agentVersion });
 * ```
 *
 * 出向路径在 `mux-transport.ts`、入向在 `mux-inbound.ts`；这里留的是对外的
 * 五个动作与它们各自的生命周期约束。
 */

/** call 的默认超时。比 farm 起一个容器 / 实机拉起一个浏览器的常见耗时留出余量。 */
export const DEFAULT_CALL_TIMEOUT_MS = 30_000;

export type { MuxHandlers, MuxRole } from "./mux-transport";

export interface MuxOptions {
	handlers?: MuxHandlers;
	role: MuxRole;
	/** 覆盖发送缓冲高水位（字节）。默认值与理由见 `mux-transport.ts`。 */
	sendHighWaterBytes?: number;
	ws: WebSocket;
}

export interface Mux {
	/** 把 `onOpenStream` 交给你的那条流接到一个真实 socket 上（agent 侧）。 */
	attachStream: (streamId: number, socket: Duplex) => void;
	/**
	 * 调对端一个方法。超时或连接断开都以 reject 收场，**不会静默挂起**。
	 * 返回的是 `unknown`：形状校验是调用方的事，用 `rpc.ts` 的 `farmRpcContracts`。
	 */
	call: (
		method: FarmRpcMethod,
		params: unknown,
		timeoutMs?: number
	) => Promise<unknown>;
	close: () => void;
	/** 要求对端连**它本机**的 `port`，返回本端这一头的管子（farm 侧）。 */
	openStream: (port: number) => MuxStream;
	sendControl: (message: ControlMessage) => void;
}

function startCall(
	state: MuxState,
	method: FarmRpcMethod,
	params: unknown,
	timeoutMs: number
): Promise<unknown> {
	if (!isOpen(state)) {
		return Promise.reject(new Error(DISCONNECT_REASON));
	}
	const id = state.nextCallId;
	state.nextCallId += 1;
	return new Promise<unknown>((resolve, reject) => {
		const timer = setTimeout(() => {
			// 只删登记不关连接：对端可能只是慢，后到的应答会被 settleCall 丢掉。
			state.pending.delete(id);
			reject(new Error(`RPC ${method}(id=${id}) 超过 ${timeoutMs}ms 未应答`));
		}, timeoutMs);
		timer.unref();
		state.pending.set(id, { reject, resolve, timer });
		sendControl(state, { id, method, params, type: "call" });
	});
}

/**
 * 开一条流。
 *
 * **只有 farm 侧会调它**，所以 streamId 空间只有一个分配者，不存在两侧撞号——
 * 真要让两侧都能开流，得先给 id 分奇偶，那是另一次改动。这条约束由
 * `control.ts` 的方向分表兜住：agent 发来的 `openStream` 在解析期就被拒。
 */
function startStream(state: MuxState, port: number): MuxStream {
	const streamId = state.nextStreamId;
	state.nextStreamId += 1;
	if (!isValidStreamId(streamId)) {
		// 4 字节 ≈ 42 亿条流。真走到这一步说明这条连接该重建了，而不是该绕回去用
		// 一个可能还活着的号。
		throw new Error("streamId 空间已耗尽，请重建连接");
	}
	const stream = registerStream(state, streamId);
	sendControl(state, { port, streamId, type: "openStream" });
	return stream;
}

function attachStream(state: MuxState, streamId: number, socket: Duplex): void {
	const stream = state.streams.get(streamId);
	if (stream === undefined) {
		throw new Error(`streamId ${streamId} 不存在或已关闭，无法接管`);
	}
	pipeStreamToSocket(stream, socket);
}

export function createMux(options: MuxOptions): Mux {
	const state = createMuxState({
		handlers: options.handlers,
		role: options.role,
		sendHighWaterBytes: options.sendHighWaterBytes,
		ws: options.ws,
	});
	state.ws.on("message", (data, isBinary) => {
		handleMessage(state, data, isBinary);
	});
	state.ws.on("close", () => {
		handleDisconnect(state, DISCONNECT_REASON);
	});
	state.ws.on("error", (error: Error) => {
		handleDisconnect(state, `WS 连接出错：${error.message}`);
	});
	return {
		attachStream: (streamId, socket) => {
			attachStream(state, streamId, socket);
		},
		call: (method, params, timeoutMs = DEFAULT_CALL_TIMEOUT_MS) =>
			startCall(state, method, params, timeoutMs),
		close: () => {
			state.ws.close();
		},
		openStream: (port) => startStream(state, port),
		sendControl: (message) => {
			sendControl(state, message);
		},
	};
}
