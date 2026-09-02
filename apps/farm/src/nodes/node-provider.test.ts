import net from "node:net";
import type { AcquiredSlot } from "@automationstack/browser-slots";
import type { FarmRpcMethod } from "@automationstack/farm-node-protocol/rpc";
import { afterEach, describe, expect, it } from "vitest";

import {
	makeSession,
	setupTempWorkDir,
	waitForTerminal,
} from "../finalize-test-harness";
import type { FarmDataPlaneDeps } from "../launch";
import { type ReaperDeps, sweepOnce } from "../reaper";
import {
	type CompositeSlotProvider,
	createCompositeProvider,
} from "./composite-provider";
import {
	connectFakeAgent,
	type FakeAgent,
	startEchoServer,
} from "./fake-agent";
import {
	makeNode,
	type NodeTestFarm,
	startFarmForNodes,
} from "./node-test-harness";

/**
 * 一台实机节点的**端到端**行为：真 WS + 真 mux + 真回环中继。
 *
 * 这里唯一是假的东西是节点上那两个「浏览器端口」——它们由一个回显服务器扮演。
 * 于是「farm 的回环端点能不能真的搬字节」这个问题在下面是被真实回答的：
 * 用例往中继端口写一串字节，它得穿过 WebSocket 隧道到达另一侧再原路回来。
 */

/** 回环中继的端点长相：farm 本机 + 一个随机高位端口。 */
const LOOPBACK_URL = /^http:\/\/127\.0\.0\.1:\d+$/;

setupTempWorkDir();

interface NodeCase {
	agent: FakeAgent;
	composite: CompositeSlotProvider;
	echo: { close: () => Promise<void>; port: number };
	farm: NodeTestFarm;
	/** 节点收到的 release 请求，用来断言「farm 确实通知了对端」。 */
	released: string[];
	state: { acquireParams: unknown; listFails: boolean };
}

let current: NodeCase | null = null;

afterEach(async () => {
	current?.agent.kill();
	await current?.echo.close();
	await current?.farm.close();
	current = null;
});

async function setupNode(): Promise<NodeCase> {
	const echo = await startEchoServer();
	const farm = await startFarmForNodes([
		makeNode({ maxSlots: 2, name: "mac-01", token: "t" }),
	]);
	const released: string[] = [];
	const state: { acquireParams: unknown; listFails: boolean } = {
		acquireParams: null,
		listFails: false,
	};
	const onCall = (method: FarmRpcMethod, params: unknown): Promise<unknown> => {
		if (method === "acquire") {
			state.acquireParams = params;
			return Promise.resolve({
				browserArgs: ["--headless=new"],
				// 节点本机的调试端口，与下面那个「浏览器端口」不是一回事。
				cdpDebugPort: 9222,
				cdpPort: echo.port,
				containerId: "slot-1",
				wdPort: echo.port,
			});
		}
		if (method === "listManaged") {
			return state.listFails
				? Promise.reject(new Error("节点忙不过来"))
				: Promise.resolve([]);
		}
		if (method === "readLogs") {
			return Promise.resolve({ logs: "chromedriver 起来了\n" });
		}
		released.push("slot-1");
		return Promise.resolve(null);
	};
	const agent = connectFakeAgent({
		// 这台机器要真的有 chrome 141，否则调度的能力闸门会在 acquire 之前就把
		// 请求拦下——本文件问的是隧道与 RPC，闸门本身在 `pick-source.test.ts` 里问。
		capabilities: {
			backend: "local",
			browsers: [
				{
					available: true,
					bin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
					name: "chrome",
					version: "141.0.7390.65",
				},
			],
			detectedAtEpochSec: 1_760_000_000,
		},
		onCall,
		token: "t",
		url: farm.url,
	});
	const settled = await agent.settled;
	expect(settled.ok).toBe(true);
	const composite = createCompositeProvider(farm.sources);
	const nodeCase: NodeCase = { agent, composite, echo, farm, released, state };
	current = nodeCase;
	return nodeCase;
}

function acquireOnNode(
	composite: CompositeSlotProvider
): Promise<AcquiredSlot> {
	return composite.acquire({
		// 上游（launch）直接从目录行下发浏览器，节点不再从镜像 tag 反解。
		browserName: "chrome",
		browserVersion: "141",
		expiresAtEpochSec: Math.floor(Date.now() / 1000) + 600,
		image: "automationstack-browser-chromium:140",
		mode: "webdriver",
		sessionId: "11111111-1111-1111-1111-111111111111",
	});
}

/** 往一个 TCP 端口写一句话，把回来的第一段字节读出来。 */
function roundTrip(port: number, payload: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = net.connect(port, "127.0.0.1", () => {
			socket.write(payload);
		});
		socket.on("data", (chunk) => {
			socket.end();
			resolve(chunk.toString("utf8"));
		});
		socket.on("error", reject);
	});
}

function makeReaperDeps(nodeCase: NodeCase): ReaperDeps {
	const plane: FarmDataPlaneDeps = {
		...nodeCase.farm.harness.deps,
		browsers: {
			findBrowserByNameVersion: () => Promise.resolve(null),
			findDefaultBrowser: () => Promise.resolve(null),
		},
		provider: nodeCase.composite,
		sessionRows: { createSession: () => Promise.resolve(null) },
		sources: nodeCase.composite,
		startRecorder: () => Promise.reject(new Error("用例不起 recorder")),
	};
	return {
		...plane,
		control: {
			ensureDefaultBrowser: () => Promise.resolve(null),
			listKillRequestedSessionIds: () => Promise.resolve([]),
			listRefreshRequestedNodeIds: () => Promise.resolve([]),
			markOrphanedRunningSessions: () => Promise.resolve([]),
			saveNodeCapabilities: () => Promise.resolve(),
		},
	};
}

describe("NodeProvider：RPC 与隧道", () => {
	it("acquire 回来的端点是 farm 本机的，字节却走到了节点那一侧", async () => {
		const nodeCase = await setupNode();
		const slot = await acquireOnNode(nodeCase.composite);

		expect(slot.containerId).toBe("slot-1");
		expect(slot.browserArgs).toEqual(["--headless=new"]);
		// 中继端口是新开的，绝不等于节点那侧的端口。
		expect(slot.cdpHttpEndpoint).toMatch(LOOPBACK_URL);
		expect(slot.cdpHttpEndpoint).not.toContain(`:${nodeCase.echo.port}`);
		// `cdpDebugPort` 是**节点本机的**：它会被注入成 --remote-debugging-port。
		expect(slot.cdpDebugPort).toBe(9222);

		const cdpPort = Number(new URL(slot.cdpHttpEndpoint).port);
		await expect(roundTrip(cdpPort, "GET /json/version")).resolves.toBe(
			"GET /json/version"
		);
		expect(slot.wdEndpoint).not.toBeNull();
		const wdPort = Number(new URL(slot.wdEndpoint ?? "").port);
		await expect(roundTrip(wdPort, "POST /session")).resolves.toBe(
			"POST /session"
		);
		expect(wdPort).not.toBe(cdpPort);

		await expect(slot.readLogs()).resolves.toContain("chromedriver");
	});

	it("下发的浏览器原样进 RPC，不再从镜像 tag 反解", async () => {
		const nodeCase = await setupNode();
		await acquireOnNode(nodeCase.composite);

		// 上游点的是 chrome 141，原样进 RPC，不从镜像 tag 反解。
		// image 是 null：这台机器登记为 local 后端，它的浏览器来自本机探测，
		// farm 的镜像库里未必有对应的行（`rpc.ts` 的 `image`）。
		expect(nodeCase.state.acquireParams).toMatchObject({
			browserName: "chrome",
			browserVersion: "141",
			image: null,
		});
	});

	it("release 先收中继再通知节点，且是幂等的", async () => {
		const nodeCase = await setupNode();
		const slot = await acquireOnNode(nodeCase.composite);
		const cdpPort = Number(new URL(slot.cdpHttpEndpoint).port);

		await slot.release();
		await slot.release();
		expect(nodeCase.released).toEqual(["slot-1"]);
		// 中继已经不在了：客户端拿到的是干净的「连不上」。
		await expect(roundTrip(cdpPort, "ping")).rejects.toThrow();
		// 槽位归还，那台机器的占位也退了回去。
		expect(nodeCase.composite.usage()[0]?.active).toBe(0);
	});

	it("as:options.node 点名这台机器：点中之后容器归属也登记在它名下", async () => {
		const nodeCase = await setupNode();
		const slot = await nodeCase.composite.acquire({
			// 点名的这台机器真的有 chrome 141（`setupNode` 里那份能力），
			// 否则先被能力闸门拦下的就不是这条用例要问的事了。
			browserName: "chrome",
			browserVersion: "141",
			expiresAtEpochSec: Math.floor(Date.now() / 1000) + 600,
			image: "automationstack-browser-chromium:140",
			mode: "cdp",
			nodeHint: "mac-01",
			sessionId: "22222222-2222-2222-2222-222222222222",
		});
		// 这一路走的是 mode: "cdp"，与上面那条 webdriver 的路径共用同一套中继逻辑。
		expect(nodeCase.composite.sourceNameOfContainer(slot.containerId)).toBe(
			"mac-01"
		);
		await slot.release();
	});
});

describe("失联与对账", () => {
	it("节点断线：它上面的会话立刻按 node_lost 收尾（没有宽限期）", async () => {
		const nodeCase = await setupNode();
		const slot = await acquireOnNode(nodeCase.composite);
		const session = makeSession(nodeCase.farm.harness.deps);
		session.slot = slot;

		nodeCase.agent.kill();

		const terminal = await waitForTerminal(nodeCase.farm.harness);
		expect(terminal.status).toBe("failed");
		expect(terminal.statusReason).toContain("node_lost");
		// 源连同它的容器绑定一起消失，新会话不会再被派到这台机器上。
		expect(nodeCase.farm.sources.list()).toHaveLength(0);
		expect(nodeCase.farm.harness.deps.registry.get(session.id)).toBeUndefined();
	});

	it("reaper：一台节点这一轮问不出来，只跳过它，不判死它上面的会话", async () => {
		const nodeCase = await setupNode();
		const slot = await acquireOnNode(nodeCase.composite);
		const session = makeSession(nodeCase.farm.harness.deps);
		session.slot = slot;
		const deps = makeReaperDeps(nodeCase);

		nodeCase.state.listFails = true;
		await sweepOnce(deps);
		// 一次 RPC 失败不等于「容器没了」。
		expect(nodeCase.farm.harness.statusWrites).toHaveLength(0);
		expect(nodeCase.farm.harness.deps.registry.get(session.id)).toBeDefined();

		// 同一台机器答得上来、且确实没有这个槽位了 → 这一次才判。
		nodeCase.state.listFails = false;
		await sweepOnce(deps);
		const terminal = await waitForTerminal(nodeCase.farm.harness);
		expect(terminal.statusReason).toContain("container_vanished");
	});
});
