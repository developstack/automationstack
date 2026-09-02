import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";
import type { FarmRpcMethod } from "@automationstack/farm-node-protocol/rpc";
import { afterEach, describe, expect, it, vi } from "vitest";

import { connectFakeAgent, type FakeAgent } from "./fake-agent";
import {
	makeNode,
	type NodeTestFarm,
	startFarmForNodes,
} from "./node-test-harness";

/**
 * 节点接入的**真 WS** 行为用例：进程内起一个 http server，拿真的 `ws` 连上去，
 * 两侧跑的是同一个 mux 包。
 *
 * 为什么不 mock 掉 WS：这条链路上最容易错、也最难在真机上复现的东西全在
 * 「真的连上去」之后——方向搞反的控制帧 schema、握手竞态、close 事件的迟到。
 * mock 之后这些恰好一个都测不到，剩下的只是「我调了我自己」。
 */

let farm: NodeTestFarm | null = null;
const agents: FakeAgent[] = [];

afterEach(async () => {
	for (const agent of agents) {
		agent.kill();
	}
	agents.length = 0;
	await farm?.close();
	farm = null;
});

function connect(options: {
	backends?: ("docker" | "local")[];
	capabilities?: NodeCapabilities;
	onCall?: (method: FarmRpcMethod, params: unknown) => Promise<unknown>;
	token: string;
	url: string;
}): FakeAgent {
	const agent = connectFakeAgent({
		backends: options.backends,
		capabilities: options.capabilities,
		onCall: options.onCall,
		token: options.token,
		url: options.url,
	});
	agents.push(agent);
	return agent;
}

describe("hello 鉴权：三种拒绝必须说成三句不同的话", () => {
	it("凭据无效", async () => {
		farm = await startFarmForNodes([
			makeNode({ name: "mac-01", token: "good" }),
		]);
		const agent = connect({ token: "bad", url: farm.url });
		await expect(agent.settled).resolves.toEqual({
			ok: false,
			reason: "节点凭据无效",
		});
		expect(farm.sources.list()).toHaveLength(0);
	});

	it("已停用（运维故意按下的，agent 该安静退避而不是报错退出）", async () => {
		farm = await startFarmForNodes([
			makeNode({ enabled: false, name: "mac-01", token: "t" }),
		]);
		const agent = connect({ token: "t", url: farm.url });
		const settled = await agent.settled;
		expect(settled.ok).toBe(false);
		if (!settled.ok) {
			expect(settled.reason).toBe("节点已停用（mac-01）");
		}
	});

	it("后端不匹配：登记成 docker 但对端只会 local", async () => {
		farm = await startFarmForNodes([
			makeNode({ backend: "docker", name: "mac-01", token: "t" }),
		]);
		const agent = connect({
			backends: ["local"],
			token: "t",
			url: farm.url,
		});
		const settled = await agent.settled;
		expect(settled.ok).toBe(false);
		if (!settled.ok) {
			// 这句话不能与「凭据无效」合并：合并之后运维会往错误的方向查半天。
			expect(settled.reason).toContain("登记为 docker 后端但对端不支持");
			expect(settled.reason).toContain("local");
		}
		expect(farm.sources.list()).toHaveLength(0);
	});
});

describe("hello 通过", () => {
	it("应答里带库里那行的身份，注册表随即多出一个源", async () => {
		farm = await startFarmForNodes([
			makeNode({ maxSlots: 3, name: "mac-01", token: "t" }),
		]);
		const agent = connect({ token: "t", url: farm.url });
		const settled = await agent.settled;
		expect(settled).toMatchObject({ maxSlots: 3, name: "mac-01", ok: true });

		const [source] = farm.sources.list();
		expect(source?.capacity).toBe(3);
		expect(source?.kind).toBe("node");
		// 内建伪节点的 nodeId 才是 null；实机必须带上库里那行的 id 供会话回填。
		expect(source?.nodeId).not.toBeNull();
		expect(farm.sources.hasFreeSlot()).toBe(true);
	});

	it("hello 里的能力快照被收进源，并落库存档", async () => {
		const capabilities: NodeCapabilities = {
			backend: "local",
			browsers: [
				{ available: true, bin: "/opt/edge", name: "edge", version: "141.0.1" },
			],
			detectedAtEpochSec: 1_760_000_001,
		};
		farm = await startFarmForNodes([makeNode({ name: "mac-01", token: "t" })]);
		const agent = connect({ capabilities, token: "t", url: farm.url });
		await agent.settled;

		expect(farm.sources.list()[0]?.capabilities).toEqual(capabilities);
		// 落库是「发射后不管」的（`node-capability-sync.ts`），让它跑完这一拍。
		await Promise.resolve();
		expect(farm.saved).toEqual([
			{ capabilities, id: farm.sources.list()[0]?.nodeId },
		]);
	});

	it("报的后端与登记的不一致：就地重探一次，换掉那份对不上的清单", async () => {
		const detected: NodeCapabilities = {
			backend: "local",
			browsers: [
				{ available: true, bin: "/opt/chrome", name: "chrome", version: "141" },
			],
			detectedAtEpochSec: 1_760_000_002,
		};
		farm = await startFarmForNodes([makeNode({ name: "mac-01", token: "t" })]);
		const agent = connect({
			// 登记是 local（`makeNode` 的默认），hello 却报了 docker 的清单——
			// agent 那边是按「docker 优先」挑的，两者可以不一致。
			capabilities: {
				backend: "docker",
				browsers: [],
				detectedAtEpochSec: 1_760_000_001,
			},
			onCall: (method) =>
				method === "detectCapabilities"
					? Promise.resolve(detected)
					: Promise.reject(new Error("用例只答重探")),
			token: "t",
			url: farm.url,
		});
		await agent.settled;
		const live = farm;
		await vi.waitFor(() => {
			expect(live.sources.list()[0]?.capabilities).toEqual(detected);
		});
		expect(live.saved.at(-1)?.capabilities).toEqual(detected);
	});

	it("心跳刷 lastSeen（管理页的在线判定只看这一列）", async () => {
		farm = await startFarmForNodes([makeNode({ name: "mac-01", token: "t" })]);
		const agent = connect({ token: "t", url: farm.url });
		await agent.settled;
		agent.heartbeat(1);
		const current = farm;
		await vi.waitFor(() => {
			expect(current.touched.length).toBeGreaterThanOrEqual(2);
		});
	});

	it("握手前的连接一个源都拿不到（首帧不是 hello 就什么都不是）", async () => {
		farm = await startFarmForNodes([makeNode({ name: "mac-01", token: "t" })]);
		const agent = connectFakeAgent({ token: "t", url: `${farm.url}` });
		agents.push(agent);
		// 抢在 open 之前把 hello 的发送掐掉：模拟一条连上来什么都不说的连接。
		agent.ws.removeAllListeners("open");
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(farm.sources.list()).toHaveLength(0);
		// 它会在 HELLO_TIMEOUT_MS 后被断开，那条计时器不在这里等（5 秒）。
	});

	it("同名重复上线：关旧迎新，且旧连接的 close 不会把新源带走", async () => {
		farm = await startFarmForNodes([makeNode({ name: "mac-01", token: "t" })]);
		const first = connect({ token: "t", url: farm.url });
		await first.settled;
		const firstClosed = new Promise<void>((resolve) => {
			first.ws.on("close", () => resolve());
		});

		const second = connect({ token: "t", url: farm.url });
		await second.settled;
		await firstClosed;

		const current = farm;
		// 旧连接的 close 回调迟到一拍；等它跑完再断言，否则测不到那个所有权判据。
		await vi.waitFor(() => {
			expect(current.sources.list()).toHaveLength(1);
		});
		expect(current.sources.get("mac-01")).toBeDefined();
		expect(second.ws.readyState).toBe(second.ws.OPEN);
	});
});
