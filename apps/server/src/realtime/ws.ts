import { resolveUserFromCookies } from "@automationstack/api/context";
import { realtimeBus } from "@automationstack/api/realtime/bus";
import { colorForName } from "@automationstack/api/realtime/presence-color";
import {
	type ClientMessage,
	clientMessageSchema,
	type PresenceEntry,
	type PresencePatch,
} from "@automationstack/api/realtime/protocol";
import { env } from "@automationstack/env/server";
import { upgradeWebSocket, type WebSocketLike } from "@hono/node-server";
import type { Context as HonoContext } from "hono";
import type { WSContext } from "hono/ws";
import { WebSocketServer } from "ws";

import {
	broadcast,
	type ClientRecord,
	getClient,
	joinRoom,
	leaveRoom,
	startPresenceSweeper,
	touchClient,
} from "./rooms";

/** 关闭码：策略违规（参数缺失 / 未登录 / Origin 不匹配）。 */
const POLICY_VIOLATION_CODE = 1008;

const DEFAULT_VIEW = "list";

type RealtimeSocket = WSContext<WebSocketLike>;

interface ConnectionParams {
	clientId: string;
	color: string;
	name: string;
	projectId: string;
	view: string;
}

/**
 * 握手参数：身份（name / color）一律由服务端按会话 cookie 推导，
 * **不接受客户端自报**——否则任何人都能顶着别人的名字出现在 presence 里。
 * 仍然从 query 里读的只有三样：clientId（标签页标识，自报无害）、
 * projectId（要进哪个房间）、view（初始视图，纯展示）。
 */
async function readParams(
	context: HonoContext
): Promise<ConnectionParams | null> {
	const clientId = context.req.query("clientId");
	const projectId = context.req.query("projectId");
	if (!(clientId && projectId)) {
		return null;
	}
	const user = await resolveUserFromCookies(context.req.header("cookie"));
	if (user === null) {
		return null;
	}
	return {
		clientId,
		color: colorForName(user.username),
		name: user.username,
		projectId,
		view: context.req.query("view") || DEFAULT_VIEW,
	};
}

/** 浏览器会带 Origin；非浏览器客户端（脚本/测试）无 Origin，放行。 */
function isAllowedOrigin(context: HonoContext): boolean {
	const origin = context.req.header("origin");
	return !origin || origin === env.CORS_ORIGIN;
}

function buildEntry(params: ConnectionParams): PresenceEntry {
	return {
		clientId: params.clientId,
		color: params.color,
		editingCaseId: null,
		joinedAt: Date.now(),
		name: params.name,
		page: null,
		view: params.view,
		// 新连接还没打开任何用例：两个字段都从 null 起步，
		// 客户端打开详情抽屉后才会用 presence:update 补上
		viewingCaseId: null,
	};
}

/** presence patch 合并进完整 entry（可空字段需区分「未提供」与 null）。 */
function mergeEntry(entry: PresenceEntry, patch: PresencePatch): PresenceEntry {
	return {
		clientId: entry.clientId,
		// name / color 不在 patch 的可选字段里：身份由握手时的会话决定
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

/**
 * `/ws` 升级处理器：`GET /ws?projectId&clientId&view`。
 * 参数缺失、未登录、Origin 不匹配时立即以 1008 关闭。
 */
export const realtimeWebSocketHandler = upgradeWebSocket(async (context) => {
	const params = await readParams(context);
	const allowed = params !== null && isAllowedOrigin(context);
	if (!(params && allowed)) {
		return {
			onOpen: (_event, socket) => {
				socket.close(POLICY_VIOLATION_CODE, "invalid realtime handshake");
			},
		};
	}
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

/** 传给 `serve({ websocket })` 的 ws 服务端（由 node-server 负责 upgrade）。 */
export const realtimeWebSocketServer = new WebSocketServer({ noServer: true });

/**
 * 启动实时协作运行时：订阅总线 fan-out + 心跳扫描。返回停止函数。
 */
export function startRealtime(): () => void {
	const unsubscribe = realtimeBus.subscribe((projectId, event) => {
		broadcast(projectId, { ...event, type: "data:invalidate" });
	});
	const stopSweeper = startPresenceSweeper();
	return () => {
		unsubscribe();
		stopSweeper();
	};
}
