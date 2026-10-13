import type { PresenceEntry } from "@automationstack/api/realtime/protocol";

import type { RealtimeStatus } from "./connection";

export type RealtimeTone = "connecting" | "offline" | "online";

export interface RealtimeStatusSummary {
	detail: string | null;
	label: string;
	tone: RealtimeTone;
}

export interface RealtimeConnectionState {
	/** 当前连接至少成功过一次。重连期间连接状态在 closed 和 connecting 之间交替。 */
	hasConnected: boolean;
	status: RealtimeStatus;
}

const CONNECTING: RealtimeStatusSummary = {
	detail: null,
	label: "正在连接实时协作",
	tone: "connecting",
};

const OFFLINE: RealtimeStatusSummary = {
	detail: "其他人的修改暂时不会同步，正在自动重连",
	label: "实时协作已断开",
	tone: "offline",
};

/** 在线用户列表按用户名去重：同一个用户的多个标签页只算一人。列表里总有自己，所以至少一人。 */
function countOnlineUsers(presence: readonly Pick<PresenceEntry, "name">[]) {
	return Math.max(1, new Set(presence.map((entry) => entry.name)).size);
}

/** 第一次连接成功之前显示「连接中」。连接成功后断开，重连期间一直显示「已断开」。 */
export function summarizeRealtimeStatus(
	{ hasConnected, status }: RealtimeConnectionState,
	presence: readonly Pick<PresenceEntry, "name">[]
): RealtimeStatusSummary {
	if (status !== "open") {
		return hasConnected ? OFFLINE : CONNECTING;
	}
	return {
		detail: `${countOnlineUsers(presence)} 人在线`,
		label: "实时协作已连接",
		tone: "online",
	};
}
