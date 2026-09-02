import { WebSocket } from "ws";

/**
 * 极薄 CDP 客户端：JSON over ws + 自增 id + sessionId 路由。
 *
 * 为什么不引 chrome-remote-interface / puppeteer-core：我们只需要「发命令、
 * 收事件」两件事，这两个库带来的是协议类型生成、Page/Frame 抽象、版本适配
 * 一大坨——而 recorder 恰恰**不能**有自己的浏览器状态机（它是第二条只读连接，
 * 与 chromedriver / Playwright 客户端共存，任何自作主张的状态管理都可能干扰
 * 用户脚本）。几十行的搬运层反而更可控。
 *
 * 扁平模式（`flatten: true`）下所有 target 的事件都走这一条 ws，靠帧里的
 * `sessionId` 分流；命令也靠同一个字段路由到具体 target。
 */

/** 单条命令的超时。挂死的命令必须自己了结，否则 pending 表会泄漏到会话结束。 */
const COMMAND_TIMEOUT_MS = 10_000;

/** 截图帧可能几 MB，ws 默认 100MB 上限够用；这里显式写出来免得默认值变了没人知道。 */
const MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;

export interface CdpEvent {
	method: string;
	params: Record<string, unknown>;
	/** browser-level 事件没有 sessionId。 */
	sessionId?: string;
}

export interface CdpConnection {
	close: () => void;
	isClosed: () => boolean;
	send: (
		method: string,
		params?: Record<string, unknown>,
		sessionId?: string
	) => Promise<Record<string, unknown>>;
}

export interface CdpConnectionHandlers {
	/** 非主动关闭时也会调用；调用方据此决定重连还是放弃。 */
	onClose: (reason: string) => void;
	onEvent: (event: CdpEvent) => void;
}

interface PendingCommand {
	reject: (error: Error) => void;
	resolve: (result: Record<string, unknown>) => void;
	timer: NodeJS.Timeout;
}

/** id → 在途命令。连接、发送、收帧三处都要读写它，所以显式当参数传。 */
type PendingCommands = Map<number, PendingCommand>;

/** 一条待发命令的三要素；凑成对象是为了不让 sendCommand 的参数表继续膨胀。 */
interface CdpCommand {
	method: string;
	params?: Record<string, unknown>;
	sessionId?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const openSocket = (wsUrl: string): Promise<WebSocket> =>
	new Promise((resolve, reject) => {
		const socket = new WebSocket(wsUrl, { maxPayload: MAX_PAYLOAD_BYTES });
		const onOpen = () => {
			socket.off("error", onError);
			resolve(socket);
		};
		const onError = (error: Error) => {
			socket.off("open", onOpen);
			reject(error);
		};
		socket.once("open", onOpen);
		socket.once("error", onError);
	});

/** 连接没了：所有在途命令必须就地了结，否则调用方的 await 会永远挂着。 */
const settleAllPending = (pending: PendingCommands, reason: string): void => {
	for (const command of pending.values()) {
		clearTimeout(command.timer);
		command.reject(new Error(`CDP 连接已断开：${reason}`));
	}
	pending.clear();
};

/** 命令响应的收尾：找回 pending、停表、按 error/result 二选一了结。 */
const settleCommand = (
	pending: PendingCommands,
	id: number,
	message: Record<string, unknown>
): void => {
	const command = pending.get(id);
	if (!command) {
		return; // 超时后才回来的迟到响应
	}
	pending.delete(id);
	clearTimeout(command.timer);
	const { error } = message;
	if (isRecord(error)) {
		command.reject(new Error(String(error.message ?? "CDP 命令失败")));
		return;
	}
	command.resolve(isRecord(message.result) ? message.result : {});
};

const parseFrame = (raw: string): Record<string, unknown> | null => {
	try {
		const parsed: unknown = JSON.parse(raw);
		return isRecord(parsed) ? parsed : null;
	} catch {
		// 不是合法 JSON 的帧只可能是协议异常，丢掉比崩掉好。
		return null;
	}
};

/** 收到一帧后的分流：有 id 的是命令响应，没有 id 的是事件——CDP 帧就这两种。 */
const dispatchFrame = (
	pending: PendingCommands,
	handlers: CdpConnectionHandlers,
	raw: string
): void => {
	const message = parseFrame(raw);
	if (!message) {
		return;
	}
	const { id } = message;
	if (typeof id === "number") {
		settleCommand(pending, id, message);
		return;
	}
	const { method } = message;
	if (typeof method !== "string") {
		return;
	}
	handlers.onEvent({
		method,
		params: isRecord(message.params) ? message.params : {},
		sessionId:
			typeof message.sessionId === "string" ? message.sessionId : undefined,
	});
};

/**
 * 发一条命令并登记 pending。超时表在这里上、socket.send 抛错也在这里就地了结：
 * 任何一条离开这个函数的命令都必须已经登记或已经了结，绝不留无人认领的条目。
 */
const sendCommand = (
	socket: WebSocket,
	pending: PendingCommands,
	id: number,
	command: CdpCommand
): Promise<Record<string, unknown>> =>
	new Promise<Record<string, unknown>>((resolve, reject) => {
		const timer = setTimeout(() => {
			pending.delete(id);
			reject(new Error(`CDP 命令超时：${command.method}`));
		}, COMMAND_TIMEOUT_MS);
		pending.set(id, { reject, resolve, timer });
		const frame: Record<string, unknown> = {
			id,
			method: command.method,
			params: command.params ?? {},
		};
		if (command.sessionId) {
			frame.sessionId = command.sessionId;
		}
		try {
			socket.send(JSON.stringify(frame));
		} catch (error) {
			pending.delete(id);
			clearTimeout(timer);
			reject(error instanceof Error ? error : new Error(String(error)));
		}
	});

export const connectCdp = async (
	wsUrl: string,
	handlers: CdpConnectionHandlers
): Promise<CdpConnection> => {
	const socket = await openSocket(wsUrl);
	const pending: PendingCommands = new Map();
	let nextId = 1;
	let closed = false;

	socket.on("message", (data) =>
		dispatchFrame(pending, handlers, data.toString())
	);
	// ws 的 'error' 后面必定跟一个 'close'，收尾统一放在 close 里做，避免报两次。
	socket.on("error", () => {
		/* 交给 'close' 统一收尾 */
	});
	socket.on("close", (code, reasonBuffer) => {
		if (closed) {
			return;
		}
		closed = true;
		const reason = reasonBuffer.toString() || `code=${code}`;
		settleAllPending(pending, reason);
		handlers.onClose(reason);
	});

	return {
		close() {
			if (closed) {
				return;
			}
			closed = true;
			settleAllPending(pending, "主动关闭");
			socket.close();
		},
		isClosed() {
			return closed;
		},
		send(method, params, sessionId) {
			if (closed) {
				return Promise.reject(new Error("CDP 连接已关闭"));
			}
			const id = nextId;
			nextId += 1;

			return sendCommand(socket, pending, id, { method, params, sessionId });
		},
	};
};
