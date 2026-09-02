import { Buffer } from "node:buffer";
import type { WebSocket } from "ws";

import { type ControlMessage, serializeControl } from "./control";
import {
	encodeControlFrame,
	encodeDataFrame,
	encodeStreamCloseFrame,
} from "./frame";
import { MuxStream } from "./mux-stream";
import type { FarmRpcMethod } from "./rpc";

/**
 * 复用器的**内部状态与出向路径**：所有往 WS 上写字节的动作都在这里，
 * 收帧那一半在 `mux-inbound.ts`，对外的 API 在 `mux.ts`。
 *
 * 拆成三个文件是被 300 行上限（scripts/check-file-rules.js）逼的，但切口选得
 * 有理由：出向只关心「连接还在不在、缓冲满没满」，入向只关心「这帧该给谁」，
 * 两者共用的只有下面这个 `MuxState`。
 *
 * 本包对 `ws` 只有**类型依赖**：`WS_OPEN` 是自己写的常量而不是
 * `import { WebSocket } from "ws"` 再取 `WebSocket.OPEN`。这样这个包不进任何人的
 * 运行时依赖图（farm / agent 各自带自己那份 ws），测试也能塞形状相符的假 socket。
 * 数字来自 RFC 6455 的 readyState 定义，不会变。
 */

/** `WebSocket.OPEN`。 */
const WS_OPEN = 1;
/** RFC 6455 的 1002 protocol error：对端说了不合协议的话。 */
const WS_CLOSE_PROTOCOL_ERROR = 1002;
/** close reason 的字节上限（RFC 6455 是 123，留些余量），超了 ws 直接抛。 */
const WS_CLOSE_REASON_MAX_BYTES = 100;

/**
 * WS 发送缓冲的高水位。超过它就不再回调 `MuxStream._write`，源端因此被
 * `pipe()` 自动暂停；降下去再放行。
 *
 * 4MB 的来历：CDP 单条消息的上限在 farm 侧被设成 256MB（截图 / DOM 快照），
 * 但**常态**消息在几十 KB 量级。取一个能装下十几条大消息、又远小于一张全页截图
 * 的值，效果是慢消费者最多让我们多占几 MB 常驻内存，而不是把整条会话的流量
 * 攒在进程里。
 *
 * 这是**粗粒度**方案：它管的是整条 WS 的缓冲，不区分是哪条流把缓冲撑起来的。
 * 浏览器流量下够用，因为 WebDriver / CDP 都是请求-应答式的，同一时刻真正在灌
 * 大 payload 的通常只有一条流。将来接 `Page.startScreencast` 那种**单向持续推流**
 * 时这个前提就没了（一条流能饿死其它所有流），届时要在协议里加 per-stream 的
 * credit 窗口，而不是把这个数调大。
 */
const DEFAULT_SEND_HIGH_WATER_BYTES = 4 * 1024 * 1024;

/**
 * 排空轮询间隔。ws 不提供 drain 事件，`bufferedAmount` 只能轮询。
 * 8ms 是「一个 TCP 往返通常还没走完」的量级：更短只是空转 CPU，更长会在大
 * 传输上叠出可观的吞吐损失（每满一次水位就多等一个周期）。
 */
const DRAIN_POLL_MS = 8;

export const DISCONNECT_REASON = "WS 连接已断开";

/** 这一端是谁。决定「对端能发什么」，见 `control.ts` 的方向分表。 */
export type MuxRole = "farm" | "node";

export interface MuxHandlers {
	/**
	 * 收到对端的 `call`。返回值被包成 `result{ok:true,value}`，抛出的错误包成
	 * `result{ok:false,error}`。**只有 agent 侧需要它**；farm 侧不实现，于是
	 * agent 万一发来 call 也只会拿回一句「本端没有实现 RPC」。
	 */
	onCall?: (method: FarmRpcMethod, params: unknown) => Promise<unknown>;
	/** 非 RPC、非流控制的消息：hello / heartbeat / helloAck / helloReject。 */
	onControl?: (message: ControlMessage) => void;
	/**
	 * 对端要求本端连 `127.0.0.1:port` 并把它接到 `streamId` 上。
	 *
	 * 回调触发时这条流**已经在注册表里**了，所以在你真正连上端口之前到达的 DATA
	 * 帧不会丢——它们躺在 Duplex 的读缓冲里等 `attachStream`。反过来做
	 * （先回调、后注册）会丢掉对端抢跑发来的第一批字节。
	 */
	onOpenStream?: (streamId: number, port: number) => void;
	/** 对端说了不合协议的话。mux 已经在关连接了，这里只是让调用方能记一笔。 */
	onProtocolError?: (message: string) => void;
}

export interface PendingCall {
	reject: (error: Error) => void;
	resolve: (value: unknown) => void;
	timer: NodeJS.Timeout;
}

export interface MuxState {
	handlers: MuxHandlers;
	highWaterBytes: number;
	nextCallId: number;
	nextStreamId: number;
	pending: Map<number, PendingCall>;
	role: MuxRole;
	streams: Map<number, MuxStream>;
	ws: WebSocket;
}

export function createMuxState(input: {
	handlers: MuxHandlers | undefined;
	role: MuxRole;
	sendHighWaterBytes: number | undefined;
	ws: WebSocket;
}): MuxState {
	return {
		handlers: input.handlers ?? {},
		highWaterBytes: input.sendHighWaterBytes ?? DEFAULT_SEND_HIGH_WATER_BYTES,
		nextCallId: 1,
		nextStreamId: 1,
		pending: new Map(),
		role: input.role,
		streams: new Map(),
		ws: input.ws,
	};
}

export const isOpen = (state: MuxState): boolean =>
	state.ws.readyState === WS_OPEN;

/**
 * 连接已经不在了就丢弃。关流帧走这条路：对着一条死连接关流是天然的 no-op，
 * 为它抛异常只会让每个 `_destroy` 都得包 try。
 */
export function sendBytes(state: MuxState, bytes: Uint8Array): void {
	if (isOpen(state)) {
		state.ws.send(bytes, { binary: true });
	}
}

export function sendControl(state: MuxState, message: ControlMessage): void {
	sendBytes(state, encodeControlFrame(serializeControl(message)));
}

/**
 * 等 WS 发送缓冲降到高水位以下。连接中途没了就 reject——在途那次写必须失败，
 * 否则上游会一直等一个永远不来的回调。
 */
function waitForDrain(state: MuxState): Promise<void> {
	if (state.ws.bufferedAmount <= state.highWaterBytes) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		const timer = setInterval(() => {
			if (!isOpen(state)) {
				clearInterval(timer);
				reject(new Error(DISCONNECT_REASON));
				return;
			}
			if (state.ws.bufferedAmount <= state.highWaterBytes) {
				clearInterval(timer);
				resolve();
			}
		}, DRAIN_POLL_MS);
		timer.unref();
	});
}

function sendData(
	state: MuxState,
	streamId: number,
	chunk: Uint8Array
): Promise<void> {
	if (!isOpen(state)) {
		return Promise.reject(new Error(DISCONNECT_REASON));
	}
	state.ws.send(encodeDataFrame(streamId, chunk), { binary: true });
	return waitForDrain(state);
}

/** 关连接并把原因报给调用方。reason 按字节截断：超长 ws 会直接抛。 */
export function failConnection(state: MuxState, message: string): void {
	state.handlers.onProtocolError?.(message);
	state.ws.close(
		WS_CLOSE_PROTOCOL_ERROR,
		Buffer.from(message, "utf8")
			.subarray(0, WS_CLOSE_REASON_MAX_BYTES)
			.toString("utf8")
	);
}

/**
 * 建一条流并登记。
 *
 * 那个空的 `error` 监听是刻意的：流出错（对端带原因关流、连接断开）在这条链路上
 * 是**常规事件**，而 Node 对没有监听者的 `error` 的处理是终止进程——一个节点掉线
 * 不该把整个 farm 带走。使用方自己挂的监听照常收到事件（Node 只在监听者数为 0 时
 * 才升级成 uncaught），所以这一行只吃掉「没人管」的那种。
 */
export function registerStream(state: MuxState, streamId: number): MuxStream {
	const stream = new MuxStream(streamId, {
		sendClose: (id, reason) => {
			sendBytes(state, encodeStreamCloseFrame(id, reason));
		},
		sendData: (id, chunk) => sendData(state, id, chunk),
	});
	stream.on("error", () => {
		// 见上：兜底监听，不做事。
	});
	state.streams.set(streamId, stream);
	return stream;
}
