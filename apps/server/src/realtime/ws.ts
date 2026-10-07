import { realtimeBus } from "@automationstack/api/realtime/bus";
import {
	type ClientMessage,
	clientMessageSchema,
	type PresenceEntry,
	type PresencePatch,
} from "@automationstack/api/realtime/protocol";
import { upgradeWebSocket, type WebSocketLike } from "@hono/node-server";
import type { WSContext } from "hono/ws";
import { WebSocketServer } from "ws";

import { type ConnectionParams, resolveHandshake } from "./handshake";
import {
	broadcast,
	type ClientRecord,
	evictUserFromRoom,
	getClient,
	joinRoom,
	leaveRoom,
	startPresenceSweeper,
	touchClient,
} from "./rooms";

const POLICY_VIOLATION_CODE = 1008;

type RealtimeSocket = WSContext<WebSocketLike>;

function buildEntry(params: ConnectionParams): PresenceEntry {
	return {
		clientId: params.clientId,
		color: params.color,
		editingCaseId: null,
		joinedAt: Date.now(),
		name: params.name,
		page: null,
		view: params.view,
		viewingCaseId: null,
	};
}

function mergeEntry(entry: PresenceEntry, patch: PresencePatch): PresenceEntry {
	return {
		clientId: entry.clientId,
		color: entry.color,
		editingCaseId:
			patch.editingCaseId === undefined
				? entry.editingCaseId
				: patch.editingCaseId,
		joinedAt: entry.joinedAt,
		name: entry.name,
		page: patch.page === undefined ? entry.page : patch.page,
		view: patch.view ?? entry.view,
		viewingCaseId:
			patch.viewingCaseId === undefined
				? entry.viewingCaseId
				: patch.viewingCaseId,
	};
}

function parseClientMessage(data: unknown): ClientMessage | null {
	if (typeof data !== "string") {
		return null;
	}
	let raw: unknown;
	try {
		raw = JSON.parse(data);
	} catch {
		return null;
	}
	const result = clientMessageSchema.safeParse(raw);
	return result.success ? result.data : null;
}

function handlePresenceUpdate(
	record: ClientRecord,
	projectId: string,
	patch: PresencePatch
): void {
	const entry = mergeEntry(record.entry, patch);
	record.entry = entry;
	broadcast(projectId, { entry, type: "presence:update" });
}

function dispatch(
	params: ConnectionParams,
	socket: RealtimeSocket,
	message: ClientMessage
): void {
	touchClient(params.projectId, params.clientId);
	const record = getClient(params.projectId, params.clientId);
	if (!record || record.socket !== socket) {
		return;
	}
	if (message.type === "ping") {
		socket.send(JSON.stringify({ type: "pong" }));
		return;
	}
	handlePresenceUpdate(record, params.projectId, message.patch);
}

function openConnection(
	params: ConnectionParams,
	socket: RealtimeSocket
): void {
	const entry = buildEntry(params);
	const others = joinRoom(params.projectId, {
		entry,
		lastSeen: Date.now(),
		socket,
		userId: params.userId,
	});
	socket.send(JSON.stringify({ entries: others, type: "presence:sync" }));
	broadcast(params.projectId, { entry, type: "presence:join" }, entry.clientId);
}

function closeConnection(
	params: ConnectionParams,
	socket: RealtimeSocket
): void {
	const removed = leaveRoom(params.projectId, params.clientId, socket);
	if (removed) {
		broadcast(params.projectId, {
			clientId: params.clientId,
			type: "presence:leave",
		});
	}
}

export const realtimeWebSocketHandler = upgradeWebSocket(async (context) => {
	const handshake = await resolveHandshake(context);
	if (handshake.kind === "rejected") {
		return {
			onOpen: (_event, socket) => {
				socket.close(POLICY_VIOLATION_CODE, handshake.reason);
			},
		};
	}
	const { params } = handshake;
	return {
		onClose: (_event, socket) => {
			closeConnection(params, socket);
		},
		onMessage: (event, socket) => {
			const message = parseClientMessage(event.data);
			if (message) {
				dispatch(params, socket, message);
			}
		},
		onOpen: (_event, socket) => {
			openConnection(params, socket);
		},
	};
});

export const realtimeWebSocketServer = new WebSocketServer({ noServer: true });

export function startRealtime(): () => void {
	const unsubscribe = realtimeBus.subscribe((projectId, event) => {
		broadcast(projectId, { ...event, type: "data:invalidate" });
	});
	const unsubscribeRevoked = realtimeBus.subscribeMembershipRevoked(
		(projectId, userId) => {
			evictUserFromRoom(projectId, userId);
		}
	);
	const stopSweeper = startPresenceSweeper();
	return () => {
		unsubscribe();
		unsubscribeRevoked();
		stopSweeper();
	};
}
