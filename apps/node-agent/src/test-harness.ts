import { once } from "node:events";
import {
	type AddressInfo,
	createServer,
	type Server,
	type Socket,
} from "node:net";
import type {
	AcquiredSlot,
	AcquireSlotInput,
	ManagedContainer,
	SlotProvider,
} from "@automationstack/browser-slots";
import type {
	NodeBackend,
	NodeCapabilities,
} from "@automationstack/farm-node-protocol/capabilities";
import type { NodeToFarmControl } from "@automationstack/farm-node-protocol/control";
import { createMux, type Mux } from "@automationstack/farm-node-protocol/mux";
import { type WebSocket, WebSocketServer } from "ws";

import type { AgentLogger } from "./logger";

/**
 * 行为用例的对手方：**一个进程内的假 farm**（真 WebSocketServer + 同一份 mux）、
 * 一个假 `SlotProvider`、一个真 TCP echo server。
 *
 * 假 farm 不是「一个能收 hello 的 socket」而是真的挂了 mux：这组用例要验的正是
 * 两侧那套帧/信封/流复用**接得上**，把 farm 侧换成手写的 JSON 收发，验的就只剩
 * 我们自己想象中的协议了（`mux-harness.ts` 是同一条理由）。
 *
 * 这个文件不进 tsdown 的 entry，只服务于同目录的 `*.test.ts`。
 */

/**
 * 用例里那份能力快照。定值而不是真去探这台机器——CI 上装没装 Chrome
 * 与「hello 有没有如实把快照带上」是两件事，后者才是这组用例要验的。
 */
export function fakeCapabilities(
	backend: NodeBackend = "local"
): NodeCapabilities {
	return {
		backend,
		browsers: [
			{
				available: true,
				bin: "/usr/bin/chromium",
				name: "chromium",
				version: "140.0.7339.80",
			},
		],
		detectedAtEpochSec: 1_760_000_000,
	};
}

export const silentLogger: AgentLogger = {
	error: () => undefined,
	info: () => undefined,
	warn: () => undefined,
};

interface Waiter {
	resolve: (message: NodeToFarmControl) => void;
	type: string;
}

export interface FarmConnection {
	mux: Mux;
	received: NodeToFarmControl[];
	/** 等 agent 说出某一句话（已经说过的直接命中，不会错过抢跑的帧）。 */
	waitFor: <T extends NodeToFarmControl["type"]>(
		type: T
	) => Promise<Extract<NodeToFarmControl, { type: T }>>;
	ws: WebSocket;
}

export interface FakeFarm {
	close: () => Promise<void>;
	/** 第一条进来的连接。agent 是主动拨号方，所以这里只等不拨。 */
	firstConnection: Promise<FarmConnection>;
	url: string;
}

function attachConnection(ws: WebSocket): FarmConnection {
	const received: NodeToFarmControl[] = [];
	const waiters: Waiter[] = [];
	const deliver = (message: NodeToFarmControl): void => {
		received.push(message);
		const index = waiters.findIndex((waiter) => waiter.type === message.type);
		if (index >= 0) {
			const [waiter] = waiters.splice(index, 1);
			waiter?.resolve(message);
		}
	};
	const mux = createMux({
		handlers: {
			onControl: (message) => {
				deliver(message as NodeToFarmControl);
			},
		},
		role: "farm",
		ws,
	});
	return {
		mux,
		received,
		waitFor: <T extends NodeToFarmControl["type"]>(type: T) => {
			const seen = received.find((message) => message.type === type);
			const pending =
				seen === undefined
					? new Promise<NodeToFarmControl>((resolve) => {
							waiters.push({ resolve, type });
						})
					: Promise.resolve(seen);
			// 这一步的收窄 TS 推不出来（`Extract` 撞上未实例化的 T），用例里 type
			// 与消息形态是一一对应的，断言一次比让每个调用点自己 cast 干净。
			return pending as Promise<Extract<NodeToFarmControl, { type: T }>>;
		},
		ws,
	};
}

export async function startFakeFarm(): Promise<FakeFarm> {
	const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await once(wss, "listening");
	const { port } = wss.address() as AddressInfo;
	const firstConnection = new Promise<FarmConnection>((resolve) => {
		wss.on("connection", (ws: WebSocket) => {
			resolve(attachConnection(ws));
		});
	});
	return {
		close: () =>
			new Promise<void>((resolve) => {
				for (const client of wss.clients) {
					client.terminate();
				}
				wss.close(() => resolve());
			}),
		firstConnection,
		url: `ws://127.0.0.1:${port}/nodes/connect`,
	};
}

export interface EchoServer {
	close: () => Promise<void>;
	port: number;
}

/** 一个把收到的字节原样回写的 TCP 服务端：扮演节点上那个真实的浏览器端口。 */
export async function startEchoServer(): Promise<EchoServer> {
	const server: Server = createServer((socket: Socket) => {
		socket.pipe(socket);
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	return {
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
			}),
		port: (server.address() as AddressInfo).port,
	};
}

export interface FakeProvider {
	acquired: AcquireSlotInput[];
	logs: string;
	provider: SlotProvider;
	released: string[];
}

/**
 * 假 provider。端点指向 echo server，于是 `openStream` 那条路能真的搬字节；
 * `release` 只记一笔——真去杀进程是 `packages/browser-slots` 自己的用例的事。
 */
export function createFakeProvider(input: {
	cdpPort: number;
	managed?: ManagedContainer[];
	wdPort?: number;
}): FakeProvider {
	const acquired: AcquireSlotInput[] = [];
	const released: string[] = [];
	const state: FakeProvider = {
		acquired,
		logs: "chrome 起来了\n",
		provider: {
			acquire: (slotInput) => {
				acquired.push(slotInput);
				const containerId = `local-${slotInput.sessionId}`;
				const slot: AcquiredSlot = {
					browserArgs: ["--headless=new"],
					cdpDebugPort: input.cdpPort,
					cdpHttpEndpoint: `http://127.0.0.1:${input.cdpPort}`,
					containerId,
					readLogs: () => Promise.resolve(state.logs),
					release: () => {
						released.push(containerId);
						return Promise.resolve();
					},
					wdEndpoint:
						input.wdPort === undefined
							? null
							: `http://127.0.0.1:${input.wdPort}`,
				};
				return Promise.resolve(slot);
			},
			listManagedContainers: () => Promise.resolve(input.managed ?? []),
			releaseContainer: (containerId) => {
				released.push(containerId);
				return Promise.resolve();
			},
		},
		released,
	};
	return state;
}
