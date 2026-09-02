import { EventEmitter } from "node:events";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";

import { bridge } from "./cdp/frame-bridge";
import {
	type Harness,
	makeHarness,
	makeSession,
	makeSlot,
	setupTempWorkDir,
	waitForTerminal,
} from "./finalize-test-harness";
import type { FarmDataPlaneDeps } from "./launch";
import type { RecorderRuntime } from "./recorder/recorder-session";
import { reportDetached } from "./recorder/recorder-session";
import type { RecorderHandle } from "./recorder/types";
import type { LiveSession } from "./session";
import { registerWebDriverRoutes } from "./wd/proxy";

/**
 * 「正常收尾不该留下 recorder_detached」的时序用例。
 *
 * 这条 bug 在真环境里 100% 复现、却完全看不出是 bug：每一条正常结束的 WebDriver
 * 会话，status_reason 里都写着 `recorder_detached`。原因是收尾顺序——recorder 是
 * 第二条 browser-level CDP 连接，浏览器退出时它跟着断，而它分不出「预期之中的退出」
 * 与「观测挂了」，于是重连一次再上报。
 *
 * 三组用例对着三个不同的判据：
 * - **WebDriver**：DELETE 一转发给 chromedriver 浏览器就死，所以 stop 必须在转发
 *   之前。假 recorder 的 `browserGone()` 精确模仿 recorder/client.ts 的
 *   handleClose——只有没被 stop 过时才上报——于是 stop 一旦挪回转发之后这里就红。
 * - **CDP**：客户端断开**不杀**浏览器，收尾第 ① 段「先截图再 stop」的顺序仍然成立；
 *   用例反过来钉住「别在这里抢跑 stop」，那会让 final 截图拍不到。
 * - **reportDetached**：两条数据面共用的兜底闸门，拦的是「已经在飞的那次重连」。
 */

/**
 * `wd/create-session.ts` 会 import `../auth`，而 auth 直接连库（→ DATABASE_URL 等
 * 一串环境变量）。farm 这个 vitest project 的前提是「不碰 Docker、不碰库」，所以把
 * 鉴权整个换掉——本文件只走 DELETE / WS 断链两条收尾路径，鉴权只发生在建会话上。
 */
vi.mock("./auth", () => ({
	authenticateFarmRequest: () => Promise.reject(new Error("用例不建会话")),
}));

setupTempWorkDir();

interface FakeRecorder extends RecorderHandle {
	/** 模拟浏览器退出把 recorder 的连接带走，语义同 handleClose。 */
	browserGone: () => void;
	calls: string[];
}

function makeRecorder(
	session: LiveSession,
	options: { stopFails?: boolean } = {}
): FakeRecorder {
	let stopped = false;
	const calls: string[] = [];
	return {
		browserGone: () => {
			calls.push("browser-gone");
			if (!stopped) {
				// recorder 重连一次仍失败 → launch.ts 的 onDetached。
				session.recorderDetached = true;
			}
		},
		calls,
		captureScreenshot: () => {
			calls.push("screenshot");
			return Promise.resolve();
		},
		stop: () => {
			calls.push("stop");
			stopped = true;
			if (options.stopFails === true) {
				// 连接已经断开、flush 落盘失败——停失败不该阻断收尾，也不该写死因。
				return Promise.reject(new Error("模拟 flush 失败"));
			}
			return Promise.resolve();
		},
	};
}

/** 数据面 deps：建会话那三个端口在收尾路径上用不到，给个会炸的实现钉住这一点。 */
function makeDataPlaneDeps(harness: Harness): FarmDataPlaneDeps {
	return {
		...harness.deps,
		browsers: {
			findBrowserByNameVersion: () => Promise.resolve(null),
			findDefaultBrowser: () => Promise.resolve(null),
		},
		provider: {
			acquire: () => Promise.reject(new Error("用例不建会话")),
			listManagedContainers: () => Promise.resolve([]),
			releaseContainer: () => Promise.resolve(),
		},
		sessionRows: { createSession: (row) => Promise.resolve(row) },
		// 多源那几件事在收尾路径上也用不到：这条用例根本没有槽位来源。
		sources: {
			listManagedBySource: () => Promise.resolve([]),
			nodeIdOfContainer: () => null,
			refreshNodeCapabilities: () => Promise.resolve(null),
			sourceNameOfContainer: () => null,
			usage: () => [],
		},
		startRecorder: () => Promise.reject(new Error("用例不建会话")),
	};
}

function setupWebDriver(options: { stopFails?: boolean } = {}): {
	fetchCalls: string[];
	harness: Harness;
	recorder: FakeRecorder;
	request: () => Promise<Response>;
	session: LiveSession;
} {
	const harness = makeHarness();
	const session = makeSession(harness.deps);
	session.slot = makeSlot();
	session.upstreamSessionId = "upstream-1";
	const recorder = makeRecorder(session, options);
	session.recorder = recorder;

	const fetchCalls: string[] = [];
	vi.stubGlobal("fetch", () => {
		fetchCalls.push("forward");
		// DELETE 一到 chromedriver，浏览器就退出——recorder 的连接跟着断。
		recorder.browserGone();
		return Promise.resolve(Response.json({ value: null }));
	});

	const app = new Hono();
	registerWebDriverRoutes(app, makeDataPlaneDeps(harness));
	return {
		fetchCalls,
		harness,
		recorder,
		request: async () =>
			await app.request(`/wd/hub/session/${session.id}`, {
				method: "DELETE",
			}),
		session,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("WebDriver DELETE 的收尾时序", () => {
	it("正常 DELETE 之后死因为空，不含 recorder_detached", async () => {
		const wd = setupWebDriver();

		const response = await wd.request();
		const terminal = await waitForTerminal(wd.harness);

		expect(response.status).toBe(200);
		expect(terminal.status).toBe("completed");
		expect(terminal.statusReason).toBeUndefined();
		expect(wd.session.recorderDetached).toBe(false);
		// 顺序即结论：截图 → stop → 转发（浏览器这才死）。收尾第 ① 段还会再 stop
		// 一次（幂等），所以只钉前三步。
		expect(wd.recorder.calls.slice(0, 3)).toEqual([
			"screenshot",
			"stop",
			"browser-gone",
		]);
	});

	it("stop 失败不阻断转发，也不因此写死因", async () => {
		const wd = setupWebDriver({ stopFails: true });

		const response = await wd.request();
		const terminal = await waitForTerminal(wd.harness);

		expect(response.status).toBe(200);
		expect(wd.fetchCalls).toEqual(["forward"]);
		expect(terminal.status).toBe("completed");
		expect(terminal.statusReason).toBeUndefined();
	});
});

interface FakeSocket extends EventEmitter {
	close: () => void;
	readyState: number;
	send: () => void;
}

const WS_OPEN = 1;

function makeSocket(): FakeSocket {
	const socket = new EventEmitter() as FakeSocket;
	socket.readyState = WS_OPEN;
	socket.close = () => {
		socket.readyState = 0;
	};
	socket.send = () => undefined;
	return socket;
}

describe("CDP 客户端主动断开的收尾时序", () => {
	it("死因只有 client_disconnect，且 final 截图仍在 stop 之前", async () => {
		const harness = makeHarness();
		const session = makeSession(harness.deps);
		session.slot = makeSlot();
		const recorder = makeRecorder(session);
		session.recorder = recorder;
		const client = makeSocket();
		const upstream = makeSocket();

		bridge({
			client: client as unknown as WebSocket,
			deps: makeDataPlaneDeps(harness),
			session,
			upstream: upstream as unknown as WebSocket,
		});
		client.emit("close");
		const terminal = await waitForTerminal(harness);

		expect(terminal.status).toBe("completed");
		expect(terminal.statusReason).toBe("client_disconnect");
		expect(session.recorderDetached).toBe(false);
		// 这条不只是记录现状：CDP 这边客户端断开**不杀浏览器**，所以收尾第 ① 段
		// 「先截图、再 stop」的顺序必须保住。把 stop 抢到前面（哪怕是为了防掉线
		// 上报）就会让 final 截图拍不到——recorder 的 CDP 连接已经被自己关了。
		expect(recorder.calls).toEqual(["screenshot", "stop"]);
	});
});

/** `reportDetached` 只在这两个判据上有分支，用最小的假 runtime 直接钉。 */
function makeDetachRuntime(stopped: boolean): {
	reasons: string[];
	runtime: RecorderRuntime;
} {
	const reasons: string[] = [];
	const runtime = {
		opts: {
			cdpHttpEndpoint: "http://127.0.0.1:9222",
			onDetached: (reason: string) => reasons.push(reason),
			workDir: "/tmp/unused",
		},
		state: { detachReported: false, stopped },
	} as unknown as RecorderRuntime;
	return { reasons, runtime };
}

describe("reportDetached 的 stopped 闸门", () => {
	it("stop 之后到达的掉线上报被丢弃", () => {
		const { reasons, runtime } = makeDetachRuntime(true);

		reportDetached(runtime, "recorder_detached: reconnect failed");

		expect(reasons).toEqual([]);
	});

	it("会话还活着时照常上报", () => {
		const { reasons, runtime } = makeDetachRuntime(false);

		reportDetached(runtime, "recorder_detached: reconnect failed");

		expect(reasons).toEqual(["recorder_detached: reconnect failed"]);
	});
});
