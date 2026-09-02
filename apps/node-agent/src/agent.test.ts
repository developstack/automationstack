import { once } from "node:events";
import { acquireResultSchema } from "@automationstack/farm-node-protocol/rpc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import { startAgent } from "./agent";
import type { AgentLogger } from "./logger";
import {
	createFakeProvider,
	fakeCapabilities,
	silentLogger,
	startEchoServer,
	startFakeFarm,
} from "./test-harness";

/**
 * 行为用例：**一个进程里跑完整条链路**——真 WebSocket、真 mux、真 TCP 搬字节，
 * 只有 farm 的业务侧与 `SlotProvider` 是假的。
 *
 * 这么做的理由和 `packages/farm-node-protocol` 那组用例一样：agent 唯一有意思的
 * 失败模式（握手时序、隧道接反、断线时没释放槽位）全都发生在真实 socket 的行为里，
 * 假一个 ws 只能验证我们想象中的协议。
 */

const AGENT_VERSION = "9.9.9";
const TOKEN = "as_node_test";
const FUTURE_EPOCH_SEC = Math.floor(Date.now() / 1000) + 600;

function acquireParams(sessionId: string) {
	return {
		browserName: "chromium",
		browserVersion: null,
		expiresAtEpochSec: FUTURE_EPOCH_SEC,
		image: "registry.example.com/qa/chromium-fork:2026-08",
		mode: "cdp" as const,
		sessionId,
	};
}

function recordingLogger(sink: string[]): AgentLogger {
	return {
		error: (message) => sink.push(message),
		info: () => undefined,
		warn: (message) => sink.push(message),
	};
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) {
		// biome-ignore lint/performance/noAwaitInLoops: 收尾按注册的反序串行关，端口才不会被下一个用例抢在半路
		await cleanup();
	}
});

describe("startAgent", () => {
	it("hello → helloAck → acquire → 隧道搬字节 → release → 断线全量释放", async () => {
		const echo = await startEchoServer();
		const farm = await startFakeFarm();
		cleanups.push(echo.close, farm.close);
		const fake = createFakeProvider({ cdpPort: echo.port });

		const agent = startAgent({
			agentVersion: AGENT_VERSION,
			backends: ["local"],
			capabilities: fakeCapabilities(),
			connectUrl: farm.url,
			createProvider: () => fake.provider,
			detectCapabilities: () => Promise.resolve(fakeCapabilities()),
			heartbeatIntervalMs: 20,
			logger: silentLogger,
			openWebSocket: (url) => new WebSocket(url),
			random: () => 0,
			token: TOKEN,
		});

		// [1] 握手：agent 主动拨号，第一帧是 hello，里面是凭据、如实的后端能力，
		// 以及启动时探到的浏览器清单（plan §12：节点是主体，浏览器是它上报的能力）。
		const conn = await farm.firstConnection;
		await expect(conn.waitFor("hello")).resolves.toMatchObject({
			agentVersion: AGENT_VERSION,
			backends: ["local"],
			capabilities: fakeCapabilities(),
			token: TOKEN,
		});
		conn.mux.sendControl({
			backend: "local",
			maxSlots: 2,
			name: "mac-1",
			nodeId: "node-1",
			type: "helloAck",
		});

		// [2] 心跳：ack 之后才开始，第一拍报 0 个活动槽位。
		await expect(conn.waitFor("heartbeat")).resolves.toMatchObject({
			activeSlots: 0,
		});

		// [3] acquire：应答里的端口是节点本机的端口，farm 连不上，只能开隧道。
		const slot = acquireResultSchema.parse(
			await conn.mux.call("acquire", acquireParams("s-1"))
		);
		expect(slot).toMatchObject({
			browserArgs: ["--headless=new"],
			cdpPort: echo.port,
			containerId: "local-s-1",
			wdPort: null,
		});

		// [4] 隧道：farm 侧 openStream → agent 连本机 echo server → 字节原样回来。
		const stream = conn.mux.openStream(slot.cdpPort);
		stream.write(Buffer.from("hello-node"));
		const [echoed] = (await once(stream, "data")) as [Buffer];
		expect(echoed.toString()).toBe("hello-node");
		stream.destroy();

		// [5] release：句柄表里的那个槽位被真的放掉。
		await conn.mux.call("release", { containerId: slot.containerId });
		expect(fake.released).toEqual(["local-s-1"]);

		// [6] 断线：再起一条，然后由 farm 单方面关连接——这些会话在 farm 那边
		//     会立刻被判 node_lost，浏览器留着只是泄漏，所以 agent 必须自己清干净。
		const orphan = acquireResultSchema.parse(
			await conn.mux.call("acquire", acquireParams("s-2"))
		);
		conn.ws.close();
		await vi.waitFor(() => {
			expect(fake.released).toContain(orphan.containerId);
		});

		agent.stop();
		await expect(agent.done).resolves.toBe(0);
	});

	it("平台登记的后端本机给不了：说清楚是哪一边对不上，并以非 0 退出", async () => {
		const farm = await startFakeFarm();
		cleanups.push(farm.close);
		const logs: string[] = [];
		const fake = createFakeProvider({ cdpPort: 1234 });

		const agent = startAgent({
			agentVersion: AGENT_VERSION,
			backends: ["local"],
			capabilities: fakeCapabilities(),
			connectUrl: farm.url,
			createProvider: () => fake.provider,
			detectCapabilities: () => Promise.resolve(fakeCapabilities()),
			heartbeatIntervalMs: 20,
			logger: recordingLogger(logs),
			openWebSocket: (url) => new WebSocket(url),
			token: TOKEN,
		});
		const conn = await farm.firstConnection;
		await conn.waitFor("hello");
		conn.mux.sendControl({
			backend: "docker",
			maxSlots: 1,
			name: "mac-1",
			nodeId: "node-1",
			type: "helloAck",
		});

		await expect(agent.done).resolves.toBe(1);
		expect(logs.join("\n")).toContain("此节点在平台上登记为 docker 后端");
	});

	it("helloReject 直接退出：farm 是看过凭据之后拒的，重连没有意义", async () => {
		const farm = await startFakeFarm();
		cleanups.push(farm.close);
		const logs: string[] = [];
		const fake = createFakeProvider({ cdpPort: 1234 });

		const agent = startAgent({
			agentVersion: AGENT_VERSION,
			backends: ["local"],
			capabilities: fakeCapabilities(),
			connectUrl: farm.url,
			createProvider: () => fake.provider,
			detectCapabilities: () => Promise.resolve(fakeCapabilities()),
			logger: recordingLogger(logs),
			openWebSocket: (url) => new WebSocket(url),
			token: TOKEN,
		});
		const conn = await farm.firstConnection;
		await conn.waitFor("hello");
		conn.mux.sendControl({ reason: "节点凭据无效", type: "helloReject" });

		await expect(agent.done).resolves.toBe(1);
		expect(logs.join("\n")).toContain("节点凭据无效");
	});
});
