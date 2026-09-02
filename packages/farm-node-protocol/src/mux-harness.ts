import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createServer, type Server, type Socket } from "node:net";
import { WebSocket, WebSocketServer } from "ws";

import { createMux, type Mux, type MuxHandlers } from "./mux";

/**
 * 测试脚手架：在本机随机端口上起一对**真 WebSocket**，两端各挂一个 mux。
 *
 * 不用假 socket：这个包唯一有意思的失败模式（背压、断线时序、二进制帧的
 * 分片与合并）全都发生在真实 ws 的行为里，假一个 send/on 只能验证我们自己
 * 想象中的 ws。代价是每个用例多几毫秒握手，换来的是这些用例真的能拦住回归。
 *
 * 角色固定：**server 是 farm，client 是 node**——agent 出站拨向 farm
 * （plan §12：实机不暴露端口）。
 *
 * 这个文件不在 package.json 的 exports 里，只服务于同目录的 `*.test.ts`。
 */

export interface MuxPair {
	close: () => Promise<void>;
	farm: Mux;
	farmWs: WebSocket;
	node: Mux;
	nodeWs: WebSocket;
}

export interface MuxPairInput {
	farm?: MuxHandlers;
	node?: MuxHandlers;
	/** 两端共用的发送缓冲高水位。调到极小值就能在用例里逼出背压那条路径。 */
	sendHighWaterBytes?: number;
}

export async function createMuxPair(
	input: MuxPairInput = {}
): Promise<MuxPair> {
	const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await once(wss, "listening");
	const { port } = wss.address() as AddressInfo;
	const nodeWs = new WebSocket(`ws://127.0.0.1:${port}`);
	const [connection] = await Promise.all([
		once(wss, "connection"),
		once(nodeWs, "open"),
	]);
	const [farmWs] = connection as [WebSocket];
	return {
		close: async () => {
			nodeWs.close();
			farmWs.close();
			await new Promise<void>((resolve) => {
				wss.close(() => resolve());
			});
		},
		farm: createMux({
			handlers: input.farm,
			role: "farm",
			sendHighWaterBytes: input.sendHighWaterBytes,
			ws: farmWs,
		}),
		farmWs,
		node: createMux({
			handlers: input.node,
			role: "node",
			sendHighWaterBytes: input.sendHighWaterBytes,
			ws: nodeWs,
		}),
		nodeWs,
	};
}

export interface TcpPeer {
	/** 最近一次被接受的连接。流用例里每个服务端只接一条。 */
	accepted: Promise<Socket>;
	close: () => Promise<void>;
	port: number;
}

/**
 * 起一个只接一条连接的本机 TCP 服务端，模拟节点上那个真实的
 * chromedriver / 浏览器端口——`openStream` 的语义就是「agent 连上它本机的这个口」。
 */
export async function createTcpPeer(): Promise<TcpPeer> {
	let acceptResolve: (socket: Socket) => void = () => undefined;
	const accepted = new Promise<Socket>((resolve) => {
		acceptResolve = resolve;
	});
	const server: Server = createServer((socket) => {
		acceptResolve(socket);
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	return {
		accepted,
		close: async () => {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		},
		port: (server.address() as AddressInfo).port,
	};
}

/** 把一条流上收到的全部字节攒起来，直到它结束。 */
export function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		stream.on("data", (chunk: Buffer) => chunks.push(chunk));
		stream.on("end", () => resolve(Buffer.concat(chunks)));
		stream.on("error", reject);
	});
}
