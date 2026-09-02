import type { AddressInfo } from "node:net";
import net from "node:net";
import type { Mux } from "@automationstack/farm-node-protocol/mux";
import { pipeStreamToSocket } from "@automationstack/farm-node-protocol/mux-stream";

/**
 * 把节点上的一个端口，搬到 farm 本机的一个回环端口上（plan §12 的数据面）。
 *
 * ## 为什么要有这一层
 *
 * `AcquiredSlot` 那份契约里，`wdEndpoint` / `cdpHttpEndpoint` 是**URL 字符串**，
 * 上面的 WebDriver 转发、CDP 代理、recorder 全都直接拿它去连。实机节点没有任何
 * 入向端口，浏览器只在它自己的 127.0.0.1 上听——于是这里在 farm 本机开一个
 * `127.0.0.1:0` 的监听：每来一条 TCP 连接，就 `openStream(节点端口)` 要一条
 * 隧道流，两头对接。上层拿到的还是一个普通的 `http://127.0.0.1:<port>`，
 * **它完全不知道字节走了 WebSocket**。
 *
 * 这条路能对 CDP 生效还有一个前提：Chrome 的 `webSocketDebuggerUrl` 是照着请求的
 * Host 头拼出来的，所以从中继端口问 `/json/version`，回来的就是中继端口的 ws URL，
 * 照着连回来还是走这条隧道。这与 docker 发布端口那套是同一个机制，farm 侧因此
 * 一行 URL 改写都不需要（见 `launch-readiness.ts` 里「原样返回」那段注释）。
 *
 * ## 为什么是每连接一条流，而不是一条流复用
 *
 * WebDriver 客户端会开多条 HTTP 连接，CDP 客户端还会额外开 WS；把它们塞进一条流
 * 就得再发明一层帧头去分辨谁是谁——而 mux 本来就是干这个的。每条 TCP 连接映射
 * 一条 mux 流之后，连接的开/关语义天然对齐（socket 断 → 流关 → 节点那侧的
 * socket 也断），不需要任何额外状态。
 */

export interface LoopbackRelay {
	/** 关掉监听并掐断所有在途连接。幂等。 */
	close: () => Promise<void>;
	/** farm 本机上的中继端口。 */
	port: number;
}

export interface LoopbackRelayOptions {
	mux: Mux;
	/** 节点那台机器上的目标端口（chromedriver 或 CDP）。 */
	nodePort: number;
	/** 中继本身出问题时的落盘口子（单条连接失败不该炸进程）。 */
	onError?: (error: Error) => void;
}

function bridgeConnection(
	socket: net.Socket,
	options: LoopbackRelayOptions
): void {
	// 会话内的浏览器流量都是短命令 + 长连的 CDP，禁掉 Nagle 才不会给每个
	// WebDriver 命令平白加 40ms。
	socket.setNoDelay(true);
	try {
		const stream = options.mux.openStream(options.nodePort);
		// 双向对接 + 单向错误转发，规则见 protocol 包的 `pipeStreamToSocket`。
		pipeStreamToSocket(stream, socket);
	} catch (error) {
		// openStream 只在 streamId 用尽或连接已断时抛。这条连接就地毁掉，
		// 上层看到的是一次普通的 ECONNRESET，会走它自己的重试/报错路径。
		socket.destroy();
		options.onError?.(
			error instanceof Error ? error : new Error(String(error))
		);
	}
}

/**
 * 开一个回环中继。
 *
 * 监听在 `127.0.0.1` 而不是 `0.0.0.0`：这个端口是**没有任何鉴权**的浏览器控制面，
 * 谁连上谁就能开标签页读本地文件。它只该被同机的 farm 进程自己用。
 */
export function startLoopbackRelay(
	options: LoopbackRelayOptions
): Promise<LoopbackRelay> {
	const sockets = new Set<net.Socket>();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => {
			sockets.delete(socket);
		});
		socket.on("error", () => {
			// 客户端半路走人是常态（CDP 客户端断开、WebDriver 超时重连），
			// 不记日志，交给 pipeStreamToSocket 去毁流。
		});
		bridgeConnection(socket, options);
	});

	return new Promise<LoopbackRelay>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.removeListener("error", reject);
			server.on("error", (error: Error) => {
				options.onError?.(error);
			});
			const address = server.address() as AddressInfo | null;
			if (address === null) {
				server.close();
				reject(new Error("回环中继已监听但拿不到端口"));
				return;
			}
			let closed = false;
			resolve({
				close: () =>
					new Promise<void>((done) => {
						// 幂等：release 与节点失联可能并发调它。
						if (closed) {
							done();
							return;
						}
						closed = true;
						for (const socket of sockets) {
							socket.destroy();
						}
						sockets.clear();
						// close() 只停新连接，所以上面先把在途的掐了，否则一条
						// 挂着的 CDP 长连能让回调永远不来。
						server.close(() => {
							done();
						});
					}),
				port: address.port,
			});
		});
	});
}
