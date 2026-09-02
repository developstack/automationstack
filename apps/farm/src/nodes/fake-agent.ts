import net from "node:net";
import type {
	NodeBackend,
	NodeCapabilities,
} from "@automationstack/farm-node-protocol/capabilities";
import { createMux, type Mux } from "@automationstack/farm-node-protocol/mux";
import type { FarmRpcMethod } from "@automationstack/farm-node-protocol/rpc";
import { WebSocket } from "ws";

/**
 * 进程内的**假 agent**：用例里那台「实机」。
 *
 * 它跑的是与真 agent 完全相同的那份 mux（`role: "node"`），只是把
 * provider 换成了用例给的假实现。这条测试路径因此覆盖了真正的握手、帧编解码、
 * RPC 信封与流复用——mock 掉 WS 的话，这些恰恰是最容易写错、也最难在真机上
 * 复现的部分（一个方向搞反的 schema、一个忘了注册的 streamId）。
 *
 * 放在 `src/` 而不是某个 `__fixtures__`：仓库的既有做法就是这样
 * （`finalize-test-harness.ts`），而且它必须跟着协议包一起被类型检查。
 */

/** hello 里那份能力快照的默认值。用例只在乎它**有没有原样送到**。 */
const DEFAULT_CAPABILITIES: NodeCapabilities = {
	backend: "local",
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

export interface FakeAgentOptions {
	/** hello 里声称支持的后端。默认 `["local"]`。 */
	backends?: NodeBackend[];
	/** hello 里那份能力快照。默认 `DEFAULT_CAPABILITIES`。 */
	capabilities?: NodeCapabilities;
	/** RPC 实现。不给就一律拒绝，用于只关心握手的用例。 */
	onCall?: (method: FarmRpcMethod, params: unknown) => Promise<unknown>;
	token: string;
	/** farm 的 `/nodes/connect` 地址。 */
	url: string;
}

export type HandshakeResult =
	| { ok: false; reason: string }
	| { ok: true; maxSlots: number; name: string; nodeId: string };

export interface FakeAgent {
	/** 发一次心跳。 */
	heartbeat: (activeSlots: number) => void;
	/** 断线：模拟拔网线（`terminate` 不发 close 帧，比 `close()` 更接近真的失联）。 */
	kill: () => void;
	mux: Mux;
	/** 握手结论。farm 那三种拒绝理由都会以 `ok: false` 回到这里。 */
	settled: Promise<HandshakeResult>;
	ws: WebSocket;
}

/**
 * 连上 farm 并发 hello。
 *
 * `onOpenStream` 的实现就是真 agent 的那一行：连本机端口、把 socket 接到流上。
 * 用例里那个「本机端口」是一个普通的 TCP 服务器，于是「farm 的回环端点能不能
 * 真的搬字节」这个问题在这条测试里是被真实回答的。
 */
/** hello 的应答（两种都有可能）落到握手 promise 上。 */
function settleFromControl(
	message: { type: string } & Record<string, unknown>,
	settle: (result: HandshakeResult) => void
): void {
	if (message.type === "helloAck") {
		settle({
			maxSlots: Number(message.maxSlots),
			name: String(message.name),
			nodeId: String(message.nodeId),
			ok: true,
		});
	}
	if (message.type === "helloReject") {
		settle({ ok: false, reason: String(message.reason) });
	}
}

/**
 * 连上 farm 并发 hello。
 *
 * `onOpenStream` 的实现就是真 agent 的那一行：连本机端口、把 socket 接到流上。
 * 用例里那个「本机端口」是一个普通的 TCP 服务器，于是「farm 的回环端点能不能
 * 真的搬字节」这个问题在这条测试里是被真实回答的。
 */
export function connectFakeAgent(options: FakeAgentOptions): FakeAgent {
	const ws = new WebSocket(options.url);
	let settle: (result: HandshakeResult) => void = () => undefined;
	const settled = new Promise<HandshakeResult>((resolve) => {
		settle = resolve;
	});
	const mux = createMux({
		handlers: {
			onCall: (method, params) =>
				options.onCall?.(method, params) ??
				Promise.reject(new Error(`假 agent 没有实现 ${method}`)),
			onControl: (message) => {
				settleFromControl(message, (result) => settle(result));
			},
			onOpenStream: (streamId, port) => {
				mux.attachStream(streamId, net.connect(port, "127.0.0.1"));
			},
		},
		role: "node",
		ws,
	});
	ws.on("open", () => {
		mux.sendControl({
			agentVersion: "0.0.0-test",
			backends: options.backends ?? ["local"],
			capabilities: options.capabilities ?? DEFAULT_CAPABILITIES,
			token: options.token,
			type: "hello",
		});
	});
	// 握手前就被断开（超时、协议错、连接失败）也要让等待方醒过来。
	ws.on("close", () => settle({ ok: false, reason: "连接在握手完成前就断了" }));
	ws.on("error", () => settle({ ok: false, reason: "连接出错" }));
	return {
		heartbeat: (activeSlots) => {
			mux.sendControl({ activeSlots, type: "heartbeat" });
		},
		kill: () => {
			ws.terminate();
		},
		mux,
		settled,
		ws,
	};
}

/** 一个把收到的字节原样回写的 TCP 服务器，扮演节点上的 chromedriver / CDP 端口。 */
export function startEchoServer(): Promise<{
	close: () => Promise<void>;
	port: number;
}> {
	const sockets = new Set<net.Socket>();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on("error", () => undefined);
		socket.pipe(socket);
	});
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") {
				reject(new Error("回显服务器拿不到端口"));
				return;
			}
			resolve({
				close: () =>
					new Promise<void>((done) => {
						for (const socket of sockets) {
							socket.destroy();
						}
						server.close(() => done());
					}),
				port: address.port,
			});
		});
	});
}
