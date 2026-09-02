/**
 * farm ↔ node-agent 线协议的**帧层**（plan §12「数据面可达性」的反向隧道那一档）。
 *
 * 一条 WebSocket（agent 出站拨向 farm，因此实机可以待在 NAT / 办公网里），
 * 上面跑三种帧，全部是**二进制**：
 *
 * ```
 * ┌────────┬──────────────────┬───────────────┐
 * │ 1 字节 │  4 字节大端      │  payload      │
 * │ 帧型   │  streamId        │  变长         │
 * └────────┴──────────────────┴───────────────┘
 * ```
 *
 * - `CONTROL`(0)：streamId 恒 0，payload 是 UTF-8 JSON（schema 见 `control.ts`）
 * - `DATA`(1)：某条流上的字节（WebDriver 的 HTTP、CDP 的 WS，都只是字节）
 * - `STREAM_CLOSE`(2)：payload 空 = 正常关；非空 = UTF-8 的错误说明
 *
 * ## 为什么不走「文本帧发控制、二进制帧发数据」
 *
 * 那种混用要求每收一帧先嗅探 `isBinary`，而 ws 在某些客户端上对大 payload
 * 的文本/二进制判定并不稳定（`apps/farm/src/cdp/frame-bridge.ts` 里那条
 * 「isBinary 必须原样带过去」的注释就是被这件事咬过）。统一成二进制之后，
 * 「这是什么帧」只有一个真相来源——第 0 个字节，而不是传输层的一个布尔。
 *
 * 代价是 DATA 帧要多一次 5 字节头的拼接拷贝。这是**每帧一次 memcpy**，
 * 相对的是不做任何 JSON 序列化/解析、不做 base64：一段 1MB 的截图响应
 * 在这条路上仍然是一次拷贝，走 JSON 就是四次（读、转义、解析、还原）。
 */

/** 控制帧。streamId 恒为 `CONTROL_STREAM_ID`。 */
export const FRAME_TYPE_CONTROL = 0;
/** 数据帧。 */
export const FRAME_TYPE_DATA = 1;
/** 流关闭帧。 */
export const FRAME_TYPE_STREAM_CLOSE = 2;

/** 帧头字节数：1 字节帧型 + 4 字节 streamId。 */
export const FRAME_HEADER_BYTES = 5;

/**
 * 控制帧专用的 streamId。
 *
 * 0 被占掉意味着数据流的 id 从 1 开始——这不是省一个号的问题：收到
 * `DATA streamId=0` 时能立刻判定为坏帧，而不是去一张表里查一个「碰巧没注册」
 * 的流，然后把协议违规和「流刚关掉的迟到帧」混为一谈。
 */
export const CONTROL_STREAM_ID = 0;

/** streamId 是 4 字节无符号大端整数。 */
const MAX_STREAM_ID = 0xff_ff_ff_ff;

/** 解出来的帧。三种帧型各一个分支，字段只留该帧型真正有的那些。 */
export type Frame =
	| { kind: "control"; json: string }
	| { kind: "data"; payload: Uint8Array; streamId: number }
	| { kind: "stream-close"; reason: string | null; streamId: number };

/**
 * 解帧结果。**不抛异常**：坏帧来自对端（可能是别的版本、也可能是攻击），
 * 是这条链路上的常规输入而不是本进程的 bug，用返回值表达才逼调用方处理它。
 * 仓库里 `parseCdpQuery` 的 `kind: "invalid"` 是同一套写法。
 */
export type FrameDecodeResult =
	| { kind: "invalid"; message: string }
	| { kind: "ok"; frame: Frame };

/**
 * `fatal: true` 的解码器：坏 UTF-8 会抛而不是悄悄替换成 U+FFFD。
 * 顶层建一次而不是每帧建一个（仓库 lint 的「top-level regex」同一条理由）。
 */
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const utf8Encoder = new TextEncoder();

function encodeFrame(
	type: number,
	streamId: number,
	payload: Uint8Array
): Uint8Array {
	const frame = new Uint8Array(FRAME_HEADER_BYTES + payload.length);
	const view = new DataView(frame.buffer);
	frame[0] = type;
	view.setUint32(1, streamId, false);
	frame.set(payload, FRAME_HEADER_BYTES);
	return frame;
}

/** 控制帧：JSON 文本 → 二进制帧。 */
export function encodeControlFrame(json: string): Uint8Array {
	return encodeFrame(
		FRAME_TYPE_CONTROL,
		CONTROL_STREAM_ID,
		utf8Encoder.encode(json)
	);
}

/** 数据帧。调用方保证 `streamId !== CONTROL_STREAM_ID`（由 mux 的分配器保证）。 */
export function encodeDataFrame(
	streamId: number,
	payload: Uint8Array
): Uint8Array {
	return encodeFrame(FRAME_TYPE_DATA, streamId, payload);
}

/** 关流帧。`reason` 为 null 表示正常关闭（payload 空）。 */
export function encodeStreamCloseFrame(
	streamId: number,
	reason: string | null
): Uint8Array {
	const payload =
		reason === null ? new Uint8Array(0) : utf8Encoder.encode(reason);
	return encodeFrame(FRAME_TYPE_STREAM_CLOSE, streamId, payload);
}

function decodeUtf8(bytes: Uint8Array): string | null {
	try {
		return utf8Decoder.decode(bytes);
	} catch {
		return null;
	}
}

function decodeControl(
	streamId: number,
	payload: Uint8Array
): FrameDecodeResult {
	if (streamId !== CONTROL_STREAM_ID) {
		return {
			kind: "invalid",
			message: `CONTROL 帧的 streamId 必须是 ${CONTROL_STREAM_ID}，收到 ${streamId}`,
		};
	}
	const json = decodeUtf8(payload);
	if (json === null) {
		return { kind: "invalid", message: "CONTROL 帧的 payload 不是合法 UTF-8" };
	}
	return { frame: { json, kind: "control" }, kind: "ok" };
}

function decodeStreamClose(
	streamId: number,
	payload: Uint8Array
): FrameDecodeResult {
	if (payload.length === 0) {
		return {
			frame: { kind: "stream-close", reason: null, streamId },
			kind: "ok",
		};
	}
	const reason = decodeUtf8(payload);
	if (reason === null) {
		return {
			kind: "invalid",
			message: "STREAM_CLOSE 帧的错误说明不是合法 UTF-8",
		};
	}
	return { frame: { kind: "stream-close", reason, streamId }, kind: "ok" };
}

/**
 * 解一帧。
 *
 * 拒绝的四类：短于帧头、未知帧型、CONTROL 用了非 0 的 streamId、
 * 数据面帧用了 0 号 streamId。前两类是版本或实现错，后两类是协议违规——
 * 调用方（mux）对两者的处理相同（关连接），但报出来的话不一样，
 * 排查时那句话就是全部线索。
 */
export function decodeFrame(bytes: Uint8Array): FrameDecodeResult {
	if (bytes.length < FRAME_HEADER_BYTES) {
		return {
			kind: "invalid",
			message: `帧长度 ${bytes.length} 不足最小帧头 ${FRAME_HEADER_BYTES} 字节`,
		};
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const type = view.getUint8(0);
	const streamId = view.getUint32(1, false);
	const payload = bytes.subarray(FRAME_HEADER_BYTES);
	if (type === FRAME_TYPE_CONTROL) {
		return decodeControl(streamId, payload);
	}
	if (streamId === CONTROL_STREAM_ID) {
		return {
			kind: "invalid",
			message: `帧型 ${type} 不允许使用保留的 streamId ${CONTROL_STREAM_ID}`,
		};
	}
	if (type === FRAME_TYPE_DATA) {
		return { frame: { kind: "data", payload, streamId }, kind: "ok" };
	}
	if (type === FRAME_TYPE_STREAM_CLOSE) {
		return decodeStreamClose(streamId, payload);
	}
	return { kind: "invalid", message: `未知帧型 ${type}` };
}

/** streamId 是否落在 4 字节无符号整数里（分配器绕回时的自检）。 */
export function isValidStreamId(streamId: number): boolean {
	return (
		Number.isInteger(streamId) &&
		streamId > CONTROL_STREAM_ID &&
		streamId <= MAX_STREAM_ID
	);
}
