import type {
	PresenceEntry,
	ServerMessage,
} from "@automationstack/api/realtime/protocol";

const OPEN_READY_STATE = 1;

/** 心跳扫描间隔：10s 一次全局扫描。 */
const SWEEP_INTERVAL_MS = 10_000;

/** 超过该时长未收到任何入站帧即视为掉线（客户端 25s 一次 ping）。 */
const CLIENT_TIMEOUT_MS = 60_000;

/**
 * WS 连接的最小结构约束：与 hono 的 `WSContext` 结构兼容，
 * 便于单测与其他适配器复用（不直接依赖 hono 类型）。
 */
export interface RoomSocket {
	close: (code?: number, reason?: string) => void;
	readonly readyState: number;
	send: (data: string) => void;
}

/** 房间内单个客户端：presence 完整状态 + 连接 + 最后活跃时间。 */
export interface ClientRecord {
	entry: PresenceEntry;
	lastSeen: number;
	socket: RoomSocket;
	/**
	 * 连接背后的账号 id（握手时由会话解出）。**只留在服务端**，不进
	 * `PresenceEntry`——那个结构会广播给房间里所有人，多一个字段就是多向所有
	 * 同事披露一份身份信息。这里存它只为一件事：成员被移出项目时，按 userId
	 * 找出他在这个房间里的全部连接（一个人可以开很多个标签页）并踢掉。
	 */
	userId: string;
}

/** Map<projectId, Map<clientId, ClientRecord>>。 */
const rooms = new Map<string, Map<string, ClientRecord>>();

function closeQuietly(socket: RoomSocket): void {
	try {
		socket.close();
	} catch {
		// 连接已损坏：关闭失败无需处理
	}
}

function sendPayload(socket: RoomSocket, payload: string): boolean {
	if (socket.readyState !== OPEN_READY_STATE) {
		return false;
	}
	try {
		socket.send(payload);
		return true;
	} catch {
		return false;
	}
}

function deleteClient(projectId: string, clientId: string): void {
	const room = rooms.get(projectId);
	if (!room) {
		return;
	}
	room.delete(clientId);
	if (room.size === 0) {
		rooms.delete(projectId);
	}
}

/**
 * 广播：序列化一次后逐个下发；send 失败（或连接非 OPEN）即驱逐该连接。
 * 驱逐会再次触发一次 `presence:leave` 广播——因为先删除再广播，
 * 每次递归都少一个客户端，必然收敛。
 */
export function broadcast(
	projectId: string,
	message: ServerMessage,
	excludeClientId?: string
): void {
	const room = rooms.get(projectId);
	if (!room) {
		return;
	}
	const payload = JSON.stringify(message);
	const dead: string[] = [];
	for (const [clientId, record] of room) {
		if (clientId === excludeClientId) {
			continue;
		}
		if (!sendPayload(record.socket, payload)) {
			dead.push(clientId);
		}
	}
	for (const clientId of dead) {
		evictClient(projectId, clientId);
	}
}

/** 驱逐一个连接：关闭 socket、移出房间并广播 leave。 */
export function evictClient(projectId: string, clientId: string): void {
	const record = rooms.get(projectId)?.get(clientId);
	if (!record) {
		return;
	}
	deleteClient(projectId, clientId);
	closeQuietly(record.socket);
	broadcast(projectId, { clientId, type: "presence:leave" });
}

/**
 * 踢掉某个用户在某项目内的**全部**连接（多标签页 = 多条），返回踢掉的条数。
 *
 * 先把目标 clientId 收集完再逐个 `evictClient`：`evictClient` 会广播
 * `presence:leave`，而广播过程本身可能因发送失败再驱逐别的连接、进而改动
 * 这张 Map——边遍历边删是在给自己挖坑。
 *
 * 被踢的客户端会自动重连，重连必须重新过握手校验（`./handshake.ts`），
 * 所以这里不需要判断「他是不是真的没权限了」：还有权限的人（比如平台 admin）
 * 会自己连回来，没权限的人会在握手处被 1008 挡住。
 */
export function evictUserFromRoom(projectId: string, userId: string): number {
	const room = rooms.get(projectId);
	if (!room) {
		return 0;
	}
	const targets = [...room.values()]
		.filter((record) => record.userId === userId)
		.map((record) => record.entry.clientId);
	for (const clientId of targets) {
		evictClient(projectId, clientId);
	}
	return targets.length;
}

/**
 * 加入房间。同 clientId 重连（新 socket）时替换旧记录并关闭旧连接，
 * 返回房间内**除自己以外**的全部 presence，供 `presence:sync` 使用。
 */
export function joinRoom(
	projectId: string,
	record: ClientRecord
): PresenceEntry[] {
	let room = rooms.get(projectId);
	if (!room) {
		room = new Map<string, ClientRecord>();
		rooms.set(projectId, room);
	}
	const previous = room.get(record.entry.clientId);
	if (previous && previous.socket !== record.socket) {
		closeQuietly(previous.socket);
	}
	const others = [...room.values()]
		.filter((item) => item.entry.clientId !== record.entry.clientId)
		.map((item) => item.entry);
	room.set(record.entry.clientId, record);
	return others;
}

/**
 * 离开房间。仅当房间内记录仍是该 socket 时才移除，
 * 避免旧连接的延迟 close 事件误删同 clientId 的新连接。
 */
export function leaveRoom(
	projectId: string,
	clientId: string,
	socket: RoomSocket
): boolean {
	const record = rooms.get(projectId)?.get(clientId);
	if (!record || record.socket !== socket) {
		return false;
	}
	deleteClient(projectId, clientId);
	return true;
}

export function getClient(
	projectId: string,
	clientId: string
): ClientRecord | null {
	return rooms.get(projectId)?.get(clientId) ?? null;
}

/** 收到任意入站帧时刷新活跃时间。 */
export function touchClient(projectId: string, clientId: string): void {
	const record = rooms.get(projectId)?.get(clientId);
	if (record) {
		record.lastSeen = Date.now();
	}
}

interface StaleClient {
	clientId: string;
	projectId: string;
}

function collectStaleClients(now: number): StaleClient[] {
	const stale: StaleClient[] = [];
	for (const [projectId, room] of rooms) {
		for (const [clientId, record] of room) {
			if (now - record.lastSeen > CLIENT_TIMEOUT_MS) {
				stale.push({ clientId, projectId });
			}
		}
	}
	return stale;
}

/** 单次心跳扫描：清理超时连接并广播 leave，返回清理数量。 */
export function sweepStaleClients(): number {
	const stale = collectStaleClients(Date.now());
	for (const client of stale) {
		evictClient(client.projectId, client.clientId);
	}
	return stale.length;
}

/** 启动全局心跳扫描（10s），返回停止函数。 */
export function startPresenceSweeper(): () => void {
	const timer = setInterval(sweepStaleClients, SWEEP_INTERVAL_MS);
	timer.unref();
	return () => {
		clearInterval(timer);
	};
}
