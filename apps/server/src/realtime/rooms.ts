import type {
	PresenceEntry,
	ServerMessage,
} from "@automationstack/api/realtime/protocol";

const OPEN_READY_STATE = 1;

const SWEEP_INTERVAL_MS = 10_000;

const CLIENT_TIMEOUT_MS = 60_000;

export interface RoomSocket {
	close: (code?: number, reason?: string) => void;
	readonly readyState: number;
	send: (data: string) => void;
}

export interface ClientRecord {
	entry: PresenceEntry;
	lastSeen: number;
	socket: RoomSocket;
	userId: string;
}

const rooms = new Map<string, Map<string, ClientRecord>>();

function closeQuietly(socket: RoomSocket): void {
	try {
		socket.close();
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
	} catch {}
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

export function evictClient(projectId: string, clientId: string): void {
	const record = rooms.get(projectId)?.get(clientId);
	if (!record) {
		return;
	}
	deleteClient(projectId, clientId);
	closeQuietly(record.socket);
	broadcast(projectId, { clientId, type: "presence:leave" });
}

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

export function sweepStaleClients(): number {
	const stale = collectStaleClients(Date.now());
	for (const client of stale) {
		evictClient(client.projectId, client.clientId);
	}
	return stale.length;
}

export function startPresenceSweeper(): () => void {
	const timer = setInterval(sweepStaleClients, SWEEP_INTERVAL_MS);
	timer.unref();
	return () => {
		clearInterval(timer);
	};
}
