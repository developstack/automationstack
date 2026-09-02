import { Duplex } from "node:stream";

/**
 * 一条被复用进 WS 的字节流，对使用方就是一个普通的 Node `Duplex`。
 *
 * farm 侧 `openStream(port)` 拿到它当 socket 用（喂给既有的 WebDriver / CDP
 * 数据面），agent 侧收到 `openStream` 控制帧后建出它，再和真正连上
 * `127.0.0.1:port` 的那个 socket 对接。**两侧是同一个类**——协议对称，
 * 实现就不该有两份。
 */

/** mux 提供给流的两个出口。流不认识 WS，只认识这两个函数。 */
export interface StreamTransport {
	/** 发 STREAM_CLOSE。`reason` 为 null 表示正常关闭。 */
	sendClose: (streamId: number, reason: string | null) => void;
	/**
	 * 发一个 DATA 帧。返回的 Promise 在 **WS 发送缓冲降到阈值以下**时才 resolve
	 * ——这就是背压的全部机制，见 `mux.ts` 的 `waitForDrain`。
	 */
	sendData: (streamId: number, chunk: Uint8Array) => Promise<void>;
}

export class MuxStream extends Duplex {
	readonly streamId: number;

	private readonly transport: StreamTransport;

	/**
	 * 本端是否已经（或不必再）发 STREAM_CLOSE。
	 *
	 * 两种情况置真：本端主动关过一次；对端先关了（那就绝不能回一个 STREAM_CLOSE，
	 * 否则两侧互关会在 mux 的注册表里留下一条查不到流的迟到帧）。
	 */
	private closeSent = false;

	constructor(streamId: number, transport: StreamTransport) {
		super();
		this.streamId = streamId;
		this.transport = transport;
	}

	/**
	 * 读侧不做流控。
	 *
	 * 协议里**没有 per-stream 的接收窗口**：一条流读不过来时，能做的只有
	 * 暂停整条 WS（`ws.pause()`），而那会连心跳和控制帧一起卡住——一次慢的
	 * 截图下载就能把节点判成 offline。所以这里的选择是：读侧只靠 Duplex 自己的
	 * highWaterMark 缓冲，不向对端反压。
	 *
	 * 这个取舍成立的前提是**浏览器流量是请求-应答式的**：WebDriver 每条命令一来一回，
	 * CDP 也是消息级的，对端不会在没人读的情况下持续灌几百 MB。将来要接
	 * `Page.startScreencast` 那种**单向持续推流**时，这个前提就没了，
	 * 届时要在协议里加一个带窗口的 credit 机制（DATA 帧回一个 ACK 计数），
	 * 而不是在这里加缓冲——加缓冲只是把 OOM 推迟。
	 */
	override _read(): void {
		// 见上：无 per-stream 窗口，push 由 acceptData 驱动。
	}

	override _write(
		chunk: Buffer,
		_encoding: BufferEncoding,
		callback: (error?: Error | null) => void
	): void {
		// 不 resolve 就不回调 = 上游 `pipe()` 自动暂停源端。背压靠的是这一行，
		// 而不是在别处显式 pause/resume 一个我们并不总是持有的 socket。
		this.transport
			.sendData(this.streamId, chunk)
			.then(() => callback())
			.catch((error: Error) => callback(error));
	}

	/**
	 * 本端写完了。
	 *
	 * 协议**没有半关**：只有一个 STREAM_CLOSE，它关的是整条流。所以 `end()`
	 * 的语义就是「这条流到此为止」。不做半关是因为这条链路上没有任何一个使用者
	 * 需要它——WebDriver 是一来一回，CDP 是双向长连，两者都不存在
	 * 「我说完了但还要继续听」的形态，而半关会让状态机多出两个必须在两侧都对齐的态。
	 */
	override _final(callback: (error?: Error | null) => void): void {
		this.sendCloseOnce(null);
		callback();
	}

	override _destroy(
		error: Error | null,
		callback: (error?: Error | null) => void
	): void {
		this.sendCloseOnce(error === null ? null : error.message);
		callback(error);
	}

	/** 收到对端的 DATA。 */
	acceptData(payload: Uint8Array): void {
		if (!this.readableEnded) {
			this.push(Buffer.from(payload));
		}
	}

	/**
	 * 对端关了这条流（收到 STREAM_CLOSE，或 WS 整个断了）。
	 *
	 * 正常关 → 读侧 EOF（`push(null)`）+ 写侧 end，让使用方按普通 socket 的方式
	 * 收尾。注意这条路上 `end` / `close` 要等**读缓冲被读完**才发：一条没人读的
	 * 流不会自己结束，net.Socket 的规矩一模一样。
	 *
	 * 带错误 → 直接 destroy，那句话作为 Error 抛给使用方。使用方应当挂 `error`
	 * 监听；`mux-transport.ts` 的 `registerStream` 另挂了一个空监听兜底，
	 * 免得一次节点掉线把整个进程带走。
	 */
	acceptClose(reason: string | null): void {
		this.closeSent = true;
		if (reason === null) {
			this.push(null);
			this.end();
			return;
		}
		this.destroy(new Error(reason));
	}

	private sendCloseOnce(reason: string | null): void {
		// biome-ignore lint/suspicious/noUnnecessaryConditions: biome 只看到字段的初值 false，看不到 acceptClose 与本方法里的写入
		if (this.closeSent) {
			return;
		}
		this.closeSent = true;
		this.transport.sendClose(this.streamId, reason);
	}
}

/**
 * 把一条 mux 流和一个真实 socket 对接（agent 侧收到 `openStream` 之后做的事）。
 *
 * 用 `pipe()` 而不是手写搬运：写方向的背压因此是白送的——`stream._write` 迟迟
 * 不回调时，`pipe` 会自己把 socket `pause()` 掉。手写 `socket.on("data")` 就得
 * 自己维护那对 pause/resume，而漏掉 resume 的表现是「传到一半永远卡住」，
 * 这种 bug 只在大响应上偶发。
 *
 * 错误单向转发（socket 出错毁流、流出错毁 socket），不互相回捅，否则两个
 * `error` 监听会来回触发。
 */
export function pipeStreamToSocket(stream: MuxStream, socket: Duplex): void {
	socket.pipe(stream);
	stream.pipe(socket);
	socket.on("error", (error: Error) => {
		stream.destroy(error);
	});
	stream.on("error", () => {
		socket.destroy();
	});
}
