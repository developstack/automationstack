import {
	type ClientMessage,
	type PresencePatch,
	type ServerMessage,
	serverMessageSchema,
} from "@automationstack/api/realtime/protocol";

const PING_INTERVAL_MS = 25_000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15_000;
const RECONNECT_BACKOFF_FACTOR = 2;
const RECONNECT_JITTER_RATIO = 0.3;
const JITTER_SPREAD = 2;
const HTTP_PROTOCOL_PATTERN = /^http/;

export type RealtimeStatus = "closed" | "connecting" | "open";

export interface RealtimeConnectionOptions {
	clientId: string;
	onReconnect?: () => void;
	onStatusChange?: (status: RealtimeStatus) => void;
	projectId: string;
	serverUrl: string;
	view: string;
}

type MessageListener = (message: ServerMessage) => void;

export function computeBackoffDelay(attempt: number): number {
	const base = Math.min(
		RECONNECT_BASE_DELAY_MS * RECONNECT_BACKOFF_FACTOR ** attempt,
		RECONNECT_MAX_DELAY_MS
	);
	const jitter =
		base * RECONNECT_JITTER_RATIO * (Math.random() * JITTER_SPREAD - 1);
	return Math.max(0, Math.round(base + jitter));
}

export function toWebSocketUrl(serverUrl: string): string {
	const absolute =
		serverUrl.startsWith("/") && typeof window !== "undefined"
			? `${window.location.origin}${serverUrl}`
			: serverUrl;
	const trimmed = absolute.endsWith("/") ? absolute.slice(0, -1) : absolute;
	return trimmed.replace(HTTP_PROTOCOL_PATTERN, "ws");
}

function parseServerMessage(data: unknown): ServerMessage | null {
	if (typeof data !== "string") {
		return null;
	}
	let raw: unknown;
	try {
		raw = JSON.parse(data);
	} catch {
		return null;
	}
	const result = serverMessageSchema.safeParse(raw);
	return result.success ? result.data : null;
}

export class RealtimeConnection {
	private attempts = 0;
	private lifecycle: "active" | "disposed" = "active";
	private readonly listeners = new Set<MessageListener>();
	private readonly options: RealtimeConnectionOptions;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private socket: WebSocket | null = null;

	constructor(options: RealtimeConnectionOptions) {
		this.options = options;
	}

	connect(): void {
		if (this.lifecycle === "disposed" || this.socket !== null) {
			return;
		}
		this.setStatus("connecting");
		let socket: WebSocket;
		try {
			socket = new WebSocket(this.buildUrl());
		} catch {
			this.setStatus("closed");
			this.scheduleReconnect();
			return;
		}
		this.socket = socket;
		socket.onopen = () => {
			this.handleOpen();
		};
		socket.onmessage = (event: MessageEvent) => {
			this.handleMessage(event.data);
		};
		socket.onclose = () => {
			this.handleClose();
		};
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
		socket.onerror = () => {};
	}

	dispose(): void {
		this.lifecycle = "disposed";
		this.stopPing();
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		const { socket } = this;
		this.socket = null;
		if (socket !== null) {
			socket.onclose = null;
			socket.onerror = null;
			socket.onmessage = null;
			socket.onopen = null;
			socket.close();
		}
		this.listeners.clear();
		this.setStatus("closed");
	}

	send(message: ClientMessage): void {
		const { socket } = this;
		if (socket === null || socket.readyState !== WebSocket.OPEN) {
			return;
		}
		socket.send(JSON.stringify(message));
	}

	subscribe(listener: MessageListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	updatePresence(patch: PresencePatch): void {
		this.send({ patch, type: "presence:update" });
	}

	private buildUrl(): string {
		const { clientId, projectId, view } = this.options;
		const params = new URLSearchParams({ clientId, projectId, view });
		return `${toWebSocketUrl(this.options.serverUrl)}/ws?${params.toString()}`;
	}

	private handleClose(): void {
		this.socket = null;
		this.stopPing();
		this.setStatus("closed");
		this.scheduleReconnect();
	}

	private handleMessage(data: unknown): void {
		const message = parseServerMessage(data);
		if (message === null || message.type === "pong") {
			return;
		}
		for (const listener of this.listeners) {
			listener(message);
		}
	}

	private handleOpen(): void {
		const isReconnect = this.attempts > 0;
		this.attempts = 0;
		this.setStatus("open");
		this.startPing();
		if (isReconnect) {
			this.options.onReconnect?.();
		}
	}

	private scheduleReconnect(): void {
		if (this.lifecycle === "disposed" || this.reconnectTimer !== null) {
			return;
		}
		const delay = computeBackoffDelay(this.attempts);
		this.attempts += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	private setStatus(status: RealtimeStatus): void {
		this.options.onStatusChange?.(status);
	}

	private startPing(): void {
		this.stopPing();
		this.pingTimer = setInterval(() => {
			this.send({ type: "ping" });
		}, PING_INTERVAL_MS);
	}

	private stopPing(): void {
		if (this.pingTimer !== null) {
			clearInterval(this.pingTimer);
			this.pingTimer = null;
		}
	}
}
