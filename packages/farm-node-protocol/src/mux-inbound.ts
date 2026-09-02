import { Buffer } from "node:buffer";
import type { RawData } from "ws";

import {
	type CallMessage,
	type ControlMessage,
	farmToNodeControlSchema,
	nodeToFarmControlSchema,
	type OpenStreamMessage,
	parseControl,
	type ResultMessage,
} from "./control";
import { decodeFrame, type Frame } from "./frame";
import {
	failConnection,
	type MuxState,
	registerStream,
	sendControl,
} from "./mux-transport";

/**
 * 复用器的**入向路径**：一帧从 WS 上来之后发生的全部事情。
 *
 * 这一侧的原则是**只有对端违反协议才关连接**。「查不到的 streamId」「查不到的
 * call id」都不算违反——它们是关流 / 超时与对端在途帧之间的正常竞态，把它们
 * 判成协议错，表现就是一条会话正常结束时顺带把整条节点连接也踢掉。
 */

function settleCall(state: MuxState, message: ResultMessage): void {
	const pending = state.pending.get(message.id);
	if (pending === undefined) {
		// 超时之后迟到的应答。丢弃：对端没做错任何事，它只是慢了。
		return;
	}
	state.pending.delete(message.id);
	clearTimeout(pending.timer);
	if (message.ok) {
		pending.resolve(message.value);
		return;
	}
	pending.reject(new Error(message.error));
}

/**
 * 执行对端的 call 并把结果写回。
 *
 * handler 抛出的错误在这里被**转成一句话**而不是向上冒泡：这是一次跨机器调用，
 * 对面在等一个应答，让异常在本进程里散开等于让对方一直等到超时。
 */
async function answerCall(
	state: MuxState,
	message: CallMessage
): Promise<void> {
	const handler = state.handlers.onCall;
	if (handler === undefined) {
		sendControl(state, {
			error: `本端没有实现 RPC（method=${message.method}）`,
			id: message.id,
			ok: false,
			type: "result",
		});
		return;
	}
	try {
		const value = await handler(message.method, message.params);
		sendControl(state, { id: message.id, ok: true, type: "result", value });
	} catch (error) {
		sendControl(state, {
			error: error instanceof Error ? error.message : String(error),
			id: message.id,
			ok: false,
			type: "result",
		});
	}
}

function acceptOpenStream(state: MuxState, message: OpenStreamMessage): void {
	if (state.streams.has(message.streamId)) {
		// 这个才是真协议错：id 由对端单方分配，重号说明它的分配器坏了。
		failConnection(state, `streamId ${message.streamId} 重复打开`);
		return;
	}
	const stream = registerStream(state, message.streamId);
	const handler = state.handlers.onOpenStream;
	if (handler === undefined) {
		// 本端根本不接流（farm 侧就是这样）。立刻关掉，别留一条没人认领的流。
		stream.destroy(new Error("本端不接受 openStream"));
		return;
	}
	handler(message.streamId, message.port);
}

function routeControl(state: MuxState, message: ControlMessage): void {
	if (message.type === "result") {
		settleCall(state, message);
		return;
	}
	if (message.type === "call") {
		// biome-ignore lint/complexity/noVoid: 应答是 fire-and-forget，失败已经写回 result 帧
		void answerCall(state, message);
		return;
	}
	if (message.type === "openStream") {
		acceptOpenStream(state, message);
		return;
	}
	state.handlers.onControl?.(message);
}

/**
 * 控制帧只用**对端方向**那张 schema 解。这就是「agent 冒充 farm 下发 openStream」
 * 在解析这一步就失败的地方，理由见 `control.ts` 的文件头。
 */
function handleControlFrame(state: MuxState, json: string): void {
	const schema =
		state.role === "farm" ? nodeToFarmControlSchema : farmToNodeControlSchema;
	const parsed = parseControl(schema, json);
	if (parsed.kind === "invalid") {
		failConnection(state, parsed.message);
		return;
	}
	routeControl(state, parsed.value);
}

function dispatchFrame(state: MuxState, frame: Frame): void {
	if (frame.kind === "control") {
		handleControlFrame(state, frame.json);
		return;
	}
	const stream = state.streams.get(frame.streamId);
	if (frame.kind === "data") {
		// 认不出的 streamId = 本端刚关掉这条流、对端的帧还在路上。丢弃。
		stream?.acceptData(frame.payload);
		return;
	}
	state.streams.delete(frame.streamId);
	stream?.acceptClose(frame.reason);
}

/** `RawData` 的三种形态归一成一段字节。分片数组只有在 ws 打开 fragment 合并前才会出现。 */
function toBytes(data: RawData): Uint8Array {
	if (Array.isArray(data)) {
		return Buffer.concat(data);
	}
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data);
	}
	return data;
}

export function handleMessage(
	state: MuxState,
	data: RawData,
	isBinary: boolean
): void {
	if (!isBinary) {
		failConnection(state, "线协议只接受二进制帧，收到一个文本帧");
		return;
	}
	const decoded = decodeFrame(toBytes(data));
	if (decoded.kind === "invalid") {
		failConnection(state, decoded.message);
		return;
	}
	dispatchFrame(state, decoded.frame);
}

/**
 * 连接没了：在途 call 全部以连接错拒绝，全部流销毁。
 *
 * 必须幂等——`close` 与 `error` 两个事件在异常断线时都会来。两张表清空之后
 * 第二次进来就是空转。
 */
export function handleDisconnect(state: MuxState, reason: string): void {
	const error = new Error(reason);
	for (const pending of state.pending.values()) {
		clearTimeout(pending.timer);
		pending.reject(error);
	}
	state.pending.clear();
	for (const stream of state.streams.values()) {
		stream.acceptClose(reason);
	}
	state.streams.clear();
}
