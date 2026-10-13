import type { PresenceEntry } from "@automationstack/api/realtime/protocol";

import type { RealtimeStatus } from "./connection";
import { presenceUserKey } from "./presence-users";

export type RealtimeTone = "connecting" | "offline" | "online";

export interface RealtimeStatusSummary {
	detail: string | null;
	label: string;
	/** 顶栏紧凑徽标用的短文字。 */
	shortLabel: string;
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
	shortLabel: "连接中",
	tone: "connecting",
};

const OFFLINE: RealtimeStatusSummary = {
	detail: "其他人的修改暂时不会同步，正在自动重连",
	label: "实时协作已断开",
	shortLabel: "已断开",
	tone: "offline",
};

/** 在线名单按用户去重：同一个用户的多个标签页只算一人。列表里总有自己，所以至少一人。 */
function countOnlineUsers(presence: readonly Pick<PresenceEntry, "name">[]) {
	return Math.max(1, new Set(presence.map(presenceUserKey)).size);
}

/** 第一次连接成功之前显示「连接中」。连接成功后断开，重连期间一直显示「已断开」。 */
export function summarizeRealtimeStatus(
	{ hasConnected, status }: RealtimeConnectionState,
	presence: readonly Pick<PresenceEntry, "name">[]
): RealtimeStatusSummary {
	if (status !== "open") {
		return hasConnected ? OFFLINE : CONNECTING;
	}
	const onlineText = `${countOnlineUsers(presence)} 人在线`;
	return {
		detail: onlineText,
		label: "实时协作已连接",
		shortLabel: onlineText,
		tone: "online",
	};
}
