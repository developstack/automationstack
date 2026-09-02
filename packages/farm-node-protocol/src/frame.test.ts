import { describe, expect, it } from "vitest";

import {
	CONTROL_STREAM_ID,
	decodeFrame,
	encodeControlFrame,
	encodeDataFrame,
	encodeStreamCloseFrame,
	FRAME_HEADER_BYTES,
	FRAME_TYPE_CONTROL,
	FRAME_TYPE_DATA,
	FRAME_TYPE_STREAM_CLOSE,
	isValidStreamId,
} from "./frame";

/** 手工拼一帧，用来构造编码器**写不出来**的坏帧。 */
function rawFrame(type: number, streamId: number, payload: Uint8Array) {
	const bytes = new Uint8Array(FRAME_HEADER_BYTES + payload.length);
	new DataView(bytes.buffer).setUint32(1, streamId, false);
	bytes[0] = type;
	bytes.set(payload, FRAME_HEADER_BYTES);
	return bytes;
}

describe("帧编解码往返", () => {
	it("控制帧带回原样的 JSON 文本，streamId 恒为 0", () => {
		const json = JSON.stringify({ activeSlots: 3, type: "heartbeat" });
		const decoded = decodeFrame(encodeControlFrame(json));
		expect(decoded).toEqual({ frame: { json, kind: "control" }, kind: "ok" });
	});

	it("控制帧的多字节字符不被截断", () => {
		const json = JSON.stringify({
			reason: "令牌不对：拒绝握手",
			type: "helloReject",
		});
		const decoded = decodeFrame(encodeControlFrame(json));
		expect(decoded.kind === "ok" && decoded.frame.kind === "control").toBe(
			true
		);
		expect(
			JSON.parse(
				decoded.kind === "ok" && decoded.frame.kind === "control"
					? decoded.frame.json
					: "{}"
			)
		).toEqual({
			reason: "令牌不对：拒绝握手",
			type: "helloReject",
		});
	});

	it("数据帧带回原样的字节与 streamId（4 字节大端）", () => {
		const payload = Uint8Array.from([0, 255, 7, 128, 0]);
		const decoded = decodeFrame(encodeDataFrame(0x01_02_03_04, payload));
		expect(decoded.kind).toBe("ok");
		if (decoded.kind !== "ok" || decoded.frame.kind !== "data") {
			throw new Error("应当解出数据帧");
		}
		expect(decoded.frame.streamId).toBe(0x01_02_03_04);
		expect(Array.from(decoded.frame.payload)).toEqual(Array.from(payload));
	});

	it("空载荷的数据帧是合法的", () => {
		const decoded = decodeFrame(encodeDataFrame(1, new Uint8Array(0)));
		expect(decoded.kind === "ok" && decoded.frame.kind === "data").toBe(true);
	});

	it("关流帧：空载荷 = 正常关，非空 = 错误说明", () => {
		expect(decodeFrame(encodeStreamCloseFrame(9, null))).toEqual({
			frame: { kind: "stream-close", reason: null, streamId: 9 },
			kind: "ok",
		});
		expect(decodeFrame(encodeStreamCloseFrame(9, "上游没了"))).toEqual({
			frame: { kind: "stream-close", reason: "上游没了", streamId: 9 },
			kind: "ok",
		});
	});

	it("大 payload 逐字节往返", () => {
		const payload = new Uint8Array(256 * 1024);
		for (let index = 0; index < payload.length; index += 1) {
			payload[index] = index % 251;
		}
		const decoded = decodeFrame(encodeDataFrame(2, payload));
		if (decoded.kind !== "ok" || decoded.frame.kind !== "data") {
			throw new Error("应当解出数据帧");
		}
		expect(
			Buffer.from(decoded.frame.payload).equals(Buffer.from(payload))
		).toBe(true);
	});
});

describe("坏帧一律拒绝而不是抛异常", () => {
	it("短于帧头", () => {
		const result = decodeFrame(new Uint8Array(FRAME_HEADER_BYTES - 1));
		expect(result.kind).toBe("invalid");
		expect(result.kind === "invalid" && result.message).toContain("帧头");
	});

	it("未知帧型", () => {
		const result = decodeFrame(rawFrame(9, 1, new Uint8Array(0)));
		expect(result.kind === "invalid" && result.message).toContain("未知帧型 9");
	});

	it("控制帧用了非 0 的 streamId", () => {
		const result = decodeFrame(
			rawFrame(FRAME_TYPE_CONTROL, 5, new Uint8Array(0))
		);
		expect(result.kind === "invalid" && result.message).toContain("CONTROL");
	});

	it("数据面帧占用了保留的 0 号 streamId", () => {
		for (const type of [FRAME_TYPE_DATA, FRAME_TYPE_STREAM_CLOSE]) {
			const result = decodeFrame(
				rawFrame(type, CONTROL_STREAM_ID, new Uint8Array(1))
			);
			expect(result.kind === "invalid" && result.message).toContain("保留");
		}
	});

	it("控制帧载荷不是合法 UTF-8", () => {
		const result = decodeFrame(
			rawFrame(FRAME_TYPE_CONTROL, 0, Uint8Array.from([0xff, 0xfe]))
		);
		expect(result.kind === "invalid" && result.message).toContain("UTF-8");
	});

	it("关流原因不是合法 UTF-8", () => {
		const result = decodeFrame(
			rawFrame(FRAME_TYPE_STREAM_CLOSE, 3, Uint8Array.from([0xc3, 0x28]))
		);
		expect(result.kind === "invalid" && result.message).toContain("UTF-8");
	});
});

describe("isValidStreamId", () => {
	it("0 与超出 4 字节的号都不合法", () => {
		expect(isValidStreamId(0)).toBe(false);
		expect(isValidStreamId(1)).toBe(true);
		expect(isValidStreamId(0xff_ff_ff_ff)).toBe(true);
		expect(isValidStreamId(0xff_ff_ff_ff + 1)).toBe(false);
		expect(isValidStreamId(1.5)).toBe(false);
	});
});
