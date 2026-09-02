import type {
	AcquiredSlot,
	AcquireSlotInput,
	ManagedContainer,
	SlotProvider,
} from "@automationstack/browser-slots";
import { describe, expect, it } from "vitest";

import { createCompositeProvider } from "./composite-provider";
import { createSourceRegistry, type SlotSource } from "./source-registry";

/**
 * 注册表 + 复合 provider 的纯逻辑用例（不起 WS、不连 Docker）。
 *
 * 这里盯的是三件容易在真机上表现成玄学的事：占位计数的收支平衡、
 * containerId 的路由、以及「一个源问不出来」与「这个源上没有」的分野。
 */

interface FakeProvider extends SlotProvider {
	acquires: AcquireSlotInput[];
	releasedIds: string[];
}

function makeProvider(options: {
	failAcquire?: boolean;
	failList?: boolean;
	listed?: string[];
	prefix: string;
}): FakeProvider {
	let seq = 0;
	const fake: FakeProvider = {
		acquire: (input) => {
			fake.acquires.push(input);
			if (options.failAcquire === true) {
				return Promise.reject(new Error(`${options.prefix} 拉不起来`));
			}
			seq += 1;
			const slot: AcquiredSlot = {
				browserArgs: [],
				cdpDebugPort: 9222,
				cdpHttpEndpoint: "http://127.0.0.1:9222",
				containerId: `${options.prefix}-${seq}`,
				readLogs: () => Promise.resolve(""),
				release: () => Promise.resolve(),
				wdEndpoint: null,
			};
			return Promise.resolve(slot);
		},
		acquires: [],
		listManagedContainers: (): Promise<ManagedContainer[]> =>
			options.failList === true
				? Promise.reject(new Error(`${options.prefix} 列不出来`))
				: Promise.resolve(
						(options.listed ?? []).map((containerId) => ({
							containerId,
							expiresAtEpochSec: null,
							sessionId: null,
						}))
					),
		releaseContainer: (containerId) => {
			fake.releasedIds.push(containerId);
			return Promise.resolve();
		},
		releasedIds: [],
	};
	return fake;
}

function source(
	name: string,
	capacity: number,
	provider: SlotProvider,
	kind: "builtin" | "node" = "node"
): SlotSource {
	return {
		backend: "docker",
		capabilities: null,
		capacity,
		kind,
		name,
		nodeId: kind === "builtin" ? null : `node-id-${name}`,
		provider,
		refresh: null,
	};
}

const acquireInput: AcquireSlotInput = {
	expiresAtEpochSec: 0,
	image: "browser-chromium:140",
	mode: "webdriver",
	sessionId: "s-1",
};

describe("SourceRegistry", () => {
	it("hasFreeSlot 数的是「还有没有源有空位」", () => {
		const registry = createSourceRegistry();
		registry.add(source("a", 1, makeProvider({ prefix: "a" })));
		expect(registry.hasFreeSlot()).toBe(true);
		registry.noteAcquire("a");
		expect(registry.hasFreeSlot()).toBe(false);
		registry.add(source("b", 1, makeProvider({ prefix: "b" })));
		expect(registry.hasFreeSlot()).toBe(true);
	});

	it("noteRelease 不会把计数减成负数", () => {
		const registry = createSourceRegistry();
		registry.add(source("a", 2, makeProvider({ prefix: "a" })));
		registry.noteRelease("a");
		registry.noteRelease("a");
		expect(registry.usage()[0]?.active).toBe(0);
	});

	it("remove 连同计数与容器绑定一起清掉（失联语义）", () => {
		const registry = createSourceRegistry();
		registry.add(source("a", 2, makeProvider({ prefix: "a" })));
		registry.noteAcquire("a");
		registry.bindContainer("a-1", "a");
		expect(registry.sourceOfContainer("a-1")?.name).toBe("a");
		registry.remove("a");
		expect(registry.sourceOfContainer("a-1")).toBeUndefined();
		registry.add(source("a", 2, makeProvider({ prefix: "a" })));
		// 重连回来的同名节点是干净的：不该继承上一条连接的占位。
		expect(registry.usage()[0]?.active).toBe(0);
	});

	it("bindContainer 只认已登记的源，findByNodeId 能反查", () => {
		const registry = createSourceRegistry();
		registry.bindContainer("ghost", "不存在");
		expect(registry.sourceOfContainer("ghost")).toBeUndefined();
		registry.add(source("a", 1, makeProvider({ prefix: "a" })));
		expect(registry.findByNodeId("node-id-a")?.name).toBe("a");
	});
});

describe("CompositeProvider", () => {
	it("acquire 先同步占位，再按容器 id 记住主人", async () => {
		const registry = createSourceRegistry();
		const local = makeProvider({ prefix: "local" });
		registry.add(source("local", 1, local, "builtin"));
		const node = makeProvider({ prefix: "node" });
		registry.add(source("n1", 4, node));
		const composite = createCompositeProvider(registry);

		const first = await composite.acquire(acquireInput);
		expect(first.containerId).toBe("local-1");
		expect(composite.sourceNameOfContainer("local-1")).toBe("local");
		// 内建伪节点没有库里的行，node_id 必须是 null。
		expect(composite.nodeIdOfContainer("local-1")).toBeNull();

		// local 已满，下一条自动落到节点上。
		const second = await composite.acquire(acquireInput);
		expect(second.containerId).toBe("node-1");
		expect(composite.nodeIdOfContainer("node-1")).toBe("node-id-n1");

		await first.release();
		await first.release();
		expect(composite.usage()).toEqual([
			{
				active: 0,
				backend: "docker",
				browsers: null,
				capacity: 1,
				kind: "builtin",
				name: "local",
			},
			{
				active: 1,
				backend: "docker",
				browsers: null,
				capacity: 4,
				kind: "node",
				name: "n1",
			},
		]);
	});

	it("acquire 失败要把占位退回去（否则那台机器被永久判满）", async () => {
		const registry = createSourceRegistry();
		registry.add(
			source("n1", 1, makeProvider({ failAcquire: true, prefix: "n" }))
		);
		const composite = createCompositeProvider(registry);
		await expect(composite.acquire(acquireInput)).rejects.toThrow("拉不起来");
		expect(composite.usage()[0]?.active).toBe(0);
	});

	it("点名点到没上线的源：报错而不是悄悄换一台", async () => {
		const registry = createSourceRegistry();
		registry.add(
			source("local", 4, makeProvider({ prefix: "local" }), "builtin")
		);
		const composite = createCompositeProvider(registry);
		await expect(
			composite.acquire({ ...acquireInput, nodeHint: "n404" })
		).rejects.toThrow("n404");
	});

	it("listManagedBySource 保留每个源自己的成败，并补登容器归属", async () => {
		const registry = createSourceRegistry();
		registry.add(
			source(
				"local",
				2,
				makeProvider({ listed: ["local-9"], prefix: "local" }),
				"builtin"
			)
		);
		registry.add(
			source("n1", 2, makeProvider({ failList: true, prefix: "n" }))
		);
		const composite = createCompositeProvider(registry);

		const listings = await composite.listManagedBySource();
		expect(listings.map((item) => item.source.name)).toEqual(["local", "n1"]);
		expect(listings[0]?.error).toBeNull();
		expect(listings[1]?.error).toContain("列不出来");
		// 失败的源摊平时被略过：reaper 靠 error 字段自己去分辨。
		expect(await composite.listManagedContainers()).toHaveLength(1);
		// farm 重启后内存是空的，靠这一轮补登才认得回来。
		expect(composite.sourceNameOfContainer("local-9")).toBe("local");
	});

	it("releaseContainer 认识主人时只打一处，不认识时挨个试", async () => {
		const registry = createSourceRegistry();
		const local = makeProvider({ prefix: "local" });
		const node = makeProvider({ prefix: "node" });
		registry.add(source("local", 2, local, "builtin"));
		registry.add(source("n1", 2, node));
		const composite = createCompositeProvider(registry);

		const slot = await composite.acquire(acquireInput);
		await composite.releaseContainer(slot.containerId);
		expect(local.releasedIds).toEqual(["local-1"]);
		expect(node.releasedIds).toEqual([]);

		// 孤儿容器（farm 重启前留下的）：映射没了，只能挨个源试一遍。
		await composite.releaseContainer("orphan");
		expect(local.releasedIds).toEqual(["local-1", "orphan"]);
		expect(node.releasedIds).toEqual(["orphan"]);
	});
});
