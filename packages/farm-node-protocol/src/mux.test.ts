import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";

import { encodeControlFrame } from "./frame";
import { createMuxPair, type MuxPair } from "./mux-harness";

/**
 * mux 对 mux 的 RPC 用例，跑在**真 WebSocket** 上（见 `mux-harness.ts`）。
 * 流的用例在 `mux-stream.test.ts`。
 */

let pair: MuxPair | null = null;

afterEach(async () => {
	await pair?.close();
	pair = null;
});

const never = (): Promise<never> => new Promise(() => undefined);

/** 顶层正则：biome 的 useTopLevelRegex 不接受在用例体里现建。 */
const TIMED_OUT_60MS = /超过 60ms 未应答/;
const TIMED_OUT = /未应答/;

describe("call 往返", () => {
	it("入参原样送到、返回值原样带回", async () => {
		const seen: Array<{ method: string; params: unknown }> = [];
		pair = await createMuxPair({
			node: {
				onCall: (method, params) => {
					seen.push({ method, params });
					return Promise.resolve({ cdpPort: 39_222, containerId: "slot-1" });
				},
			},
		});
		const value = await pair.farm.call("acquire", { sessionId: "s1" });
		expect(value).toEqual({ cdpPort: 39_222, containerId: "slot-1" });
		expect(seen).toEqual([{ method: "acquire", params: { sessionId: "s1" } }]);
	});

	it("并发的 call 各回各的（id 不串）", async () => {
		pair = await createMuxPair({
			node: {
				onCall: (_method, params) =>
					Promise.resolve((params as { echo: number }).echo * 2),
			},
		});
		const results = await Promise.all([
			pair.farm.call("readLogs", { echo: 1 }),
			pair.farm.call("readLogs", { echo: 2 }),
			pair.farm.call("readLogs", { echo: 3 }),
		]);
		expect(results).toEqual([2, 4, 6]);
	});

	it("对端抛错 → 以那句话 reject，连接不受影响", async () => {
		pair = await createMuxPair({
			node: {
				onCall: () => Promise.reject(new Error("本机没装 chromium 140")),
			},
		});
		await expect(pair.farm.call("acquire", {})).rejects.toThrow(
			"本机没装 chromium 140"
		);
		// 连接还在：一次失败的 RPC 不该把整条节点连接带走。
		await expect(pair.farm.call("acquire", {})).rejects.toThrow("chromium");
	});

	it("对端没实现 onCall → 拿回一句明确的话而不是超时", async () => {
		pair = await createMuxPair();
		await expect(pair.farm.call("listManaged", {})).rejects.toThrow(
			"没有实现 RPC"
		);
	});
});

describe("超时", () => {
	it("对端不应答 → 按 timeoutMs reject", async () => {
		pair = await createMuxPair({ node: { onCall: never } });
		await expect(
			pair.farm.call("release", { containerId: "c" }, 60)
		).rejects.toThrow(TIMED_OUT_60MS);
	});

	it("超时之后迟到的应答被丢弃，不影响后续 call", async () => {
		// 用数组接住那个 resolve：`let x: F | null` 在闭包里赋值后，TS 的控制流
		// 分析仍然认为它是 null，取用处会被窄成 never。
		const late: Array<(value: unknown) => void> = [];
		pair = await createMuxPair({
			node: {
				onCall: (_method, params) => {
					if ((params as { slow?: boolean }).slow === true) {
						return new Promise((resolve) => {
							late.push(resolve);
						});
					}
					return Promise.resolve("ok");
				},
			},
		});
		await expect(
			pair.farm.call("readLogs", { slow: true }, 40)
		).rejects.toThrow(TIMED_OUT);
		late[0]?.("太晚了");
		await expect(pair.farm.call("readLogs", {})).resolves.toBe("ok");
	});
});

describe("连接断开", () => {
	it("在途的 call 全部以连接错拒绝", async () => {
		pair = await createMuxPair({ node: { onCall: never } });
		const inflight = [
			pair.farm.call("acquire", {}),
			pair.farm.call("listManaged", {}),
		];
		const settled = Promise.allSettled(inflight);
		pair.nodeWs.close();
		const outcomes = await settled;
		expect(outcomes.map((item) => item.status)).toEqual([
			"rejected",
			"rejected",
		]);
		for (const outcome of outcomes) {
			expect(
				outcome.status === "rejected" ? String(outcome.reason) : ""
			).toContain("WS 连接已断开");
		}
	});

	it("连接已经关掉之后再 call，立刻 reject 而不是挂到超时", async () => {
		pair = await createMuxPair();
		pair.nodeWs.close();
		await once(pair.farmWs, "close");
		await expect(pair.farm.call("acquire", {})).rejects.toThrow(
			"WS 连接已断开"
		);
	});
});

describe("协议违规", () => {
	it("文本帧 → 报协议错并关连接", async () => {
		const errors: string[] = [];
		pair = await createMuxPair({
			farm: {
				onProtocolError: (message) => errors.push(message),
			},
		});
		pair.nodeWs.send("hello", { binary: false });
		await once(pair.farmWs, "close");
		expect(errors[0]).toContain("只接受二进制帧");
	});

	it("agent 冒充 farm 下发 openStream → 在解析期就被拒", async () => {
		const errors: string[] = [];
		pair = await createMuxPair({
			farm: { onProtocolError: (m) => errors.push(m) },
		});
		pair.nodeWs.send(
			encodeControlFrame(
				JSON.stringify({ port: 22, streamId: 1, type: "openStream" })
			),
			{ binary: true }
		);
		await once(pair.farmWs, "close");
		expect(errors[0]).toContain("不符合协议");
	});

	it("坏帧（长度不足）→ 报协议错并关连接", async () => {
		const errors: string[] = [];
		pair = await createMuxPair({
			farm: { onProtocolError: (m) => errors.push(m) },
		});
		pair.nodeWs.send(Uint8Array.from([1, 2]), { binary: true });
		await once(pair.farmWs, "close");
		expect(errors[0]).toContain("帧头");
	});
});
