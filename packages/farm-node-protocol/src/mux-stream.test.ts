import { once } from "node:events";
import { connect, type Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
	createMuxPair,
	createTcpPeer,
	type MuxPair,
	type TcpPeer,
} from "./mux-harness";
import type { MuxStream } from "./mux-stream";

/**
 * `openStream` 的搬运语义，全程跑在真 WS + 真 TCP 上：farm 侧开流，node 侧连
 * 自己本机的端口，两头对拍字节。
 *
 * 这些用例存在的理由是**它们是真机路径唯一能在本机复现的部分**：一台实机在 NAT
 * 后面这件事没法在单测里造出来，但「一条 WS 上多路字节流的生命周期」可以，
 * 而那正是这条路上最容易出错的地方。
 */

let pair: MuxPair | null = null;
const peers: TcpPeer[] = [];

afterEach(async () => {
	await pair?.close();
	pair = null;
	await Promise.all(peers.splice(0).map((peer) => peer.close()));
});

/** 起一对 mux，node 侧照协议连本机端口并接管流。 */
async function createPipedPair(sendHighWaterBytes?: number): Promise<MuxPair> {
	const sockets: Socket[] = [];
	const created = await createMuxPair({
		node: {
			onOpenStream: (streamId, port) => {
				const socket = connect(port, "127.0.0.1");
				sockets.push(socket);
				created.node.attachStream(streamId, socket);
			},
		},
		sendHighWaterBytes,
	});
	return created;
}

async function newPeer(): Promise<TcpPeer> {
	const peer = await createTcpPeer();
	peers.push(peer);
	return peer;
}

function readExactly(
	stream: MuxStream | Socket,
	size: number
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let total = 0;
		const onData = (chunk: Buffer): void => {
			chunks.push(chunk);
			total += chunk.length;
			if (total >= size) {
				stream.off("data", onData);
				resolve(Buffer.concat(chunks));
			}
		};
		stream.on("data", onData);
		stream.once("error", reject);
	});
}

/**
 * 等一条流 `close`。不用 `events.once`：它会顺手挂一个 `error` 监听并在出错时
 * 让 Promise reject，而这里好几个用例**就是要**看到「先 error 再 close」。
 */
function whenClosed(stream: MuxStream): Promise<void> {
	return new Promise((resolve) => {
		stream.once("close", () => resolve());
	});
}

function randomBytes(size: number): Buffer {
	const buffer = Buffer.allocUnsafe(size);
	for (let index = 0; index < size; index += 1) {
		buffer[index] = (index * 31 + (index % 7)) % 256;
	}
	return buffer;
}

describe("字节双向搬运", () => {
	it("farm 写进去的字节原样到达节点本机端口，回程也原样带回", async () => {
		pair = await createPipedPair();
		const peer = await newPeer();
		const stream = pair.farm.openStream(peer.port);
		const socket = await peer.accepted;
		socket.pipe(socket); // 回声

		const payload = randomBytes(64 * 1024);
		stream.write(payload);
		const echoed = await readExactly(stream, payload.length);
		expect(echoed.equals(payload)).toBe(true);
	});

	it("高水位调到 1 字节（每帧都要等排空）时仍然走得完，不死锁", async () => {
		pair = await createPipedPair(1);
		const peer = await newPeer();
		const stream = pair.farm.openStream(peer.port);
		const socket = await peer.accepted;
		socket.pipe(socket);

		const payload = randomBytes(256 * 1024);
		stream.write(payload);
		const echoed = await readExactly(stream, payload.length);
		expect(echoed.equals(payload)).toBe(true);
	});

	it("attachStream 之前就到达的字节不会丢", async () => {
		const sockets: Socket[] = [];
		const created = await createMuxPair({
			node: {
				onOpenStream: async (streamId, port) => {
					// 故意拖一下：真实 agent 也要先完成一次 TCP 连接才能接管。
					await delay(30);
					const socket = connect(port, "127.0.0.1");
					sockets.push(socket);
					created.node.attachStream(streamId, socket);
				},
			},
		});
		pair = created;
		const peer = await newPeer();
		const stream = created.farm.openStream(peer.port);
		stream.write(Buffer.from("抢跑的第一批字节"));
		const socket = await peer.accepted;
		const received = await readExactly(
			socket,
			Buffer.byteLength("抢跑的第一批字节")
		);
		expect(received.toString("utf8")).toBe("抢跑的第一批字节");
	});
});

describe("关闭传播", () => {
	it("farm 关流 → 节点那头的 socket 收到 FIN", async () => {
		pair = await createPipedPair();
		const peer = await newPeer();
		const stream = pair.farm.openStream(peer.port);
		const socket = await peer.accepted;
		const ended = once(socket, "end");
		stream.end();
		await ended;
		expect(socket.readableEnded).toBe(true);
	});

	it("节点那头的 socket 断开 → farm 侧的流结束", async () => {
		pair = await createPipedPair();
		const peer = await newPeer();
		const stream = pair.farm.openStream(peer.port);
		const socket = await peer.accepted;
		// 必须先让读侧流起来：正常关闭走的是 `push(null)`，而 Node 只有在缓冲被读完
		// 之后才发 `end`/`close`——一条没人读的流不会自己结束，net.Socket 也一样。
		stream.resume();
		const closed = whenClosed(stream);
		socket.end();
		await closed;
		expect(stream.destroyed).toBe(true);
	});
});

describe("连接断开", () => {
	it("WS 一断，全部在开的流都被销毁并带上断开原因", async () => {
		pair = await createPipedPair();
		const first = await newPeer();
		const second = await newPeer();
		const streams = [
			pair.farm.openStream(first.port),
			pair.farm.openStream(second.port),
		];
		const errors: string[] = [];
		for (const stream of streams) {
			stream.on("error", (error: Error) => errors.push(error.message));
		}
		const closed = Promise.all(streams.map(whenClosed));
		pair.nodeWs.close();
		await closed;
		expect(streams.every((stream) => stream.destroyed)).toBe(true);
		expect(errors).toEqual(["WS 连接已断开", "WS 连接已断开"]);
	});
});

describe("多流并发", () => {
	it("三条流各走各的端口，字节不串音", async () => {
		pair = await createPipedPair();
		const tags = ["alpha", "beta", "gamma"];
		const opened = await Promise.all(
			tags.map(async (tag) => {
				const peer = await newPeer();
				const stream = pair?.farm.openStream(peer.port);
				if (stream === undefined) {
					throw new Error("mux 未就绪");
				}
				const socket = await peer.accepted;
				// 每个服务端回一段只属于自己的内容，串音会立刻现形。
				socket.on("data", (chunk: Buffer) => {
					socket.write(`${tag}:${chunk.toString("utf8")}`);
				});
				return { stream, tag };
			})
		);

		const replies = await Promise.all(
			opened.map(async ({ stream, tag }) => {
				const expected = `${tag}:ping-${tag}`;
				stream.write(`ping-${tag}`);
				const received = await readExactly(stream, expected.length);
				return received.toString("utf8");
			})
		);
		expect(replies).toEqual([
			"alpha:ping-alpha",
			"beta:ping-beta",
			"gamma:ping-gamma",
		]);
	});
});
