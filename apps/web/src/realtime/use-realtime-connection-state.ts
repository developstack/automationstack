import { useEffect, useState } from "react";

import type { RealtimeConnection } from "./connection";
import { useRealtime } from "./realtime-context";
import type { RealtimeConnectionState } from "./realtime-status";

/** 没有实时协作连接时（例如项目还在加载）按「还没连接成功」处理。切换项目后重新计算。 */
export function useRealtimeConnectionState(): RealtimeConnectionState {
	const realtime = useRealtime();
	const connection = realtime?.connection ?? null;
	const status = realtime?.status ?? "connecting";
	const [openedConnection, setOpenedConnection] =
		useState<RealtimeConnection | null>(null);
	useEffect(() => {
		if (status === "open" && connection !== null) {
			setOpenedConnection(connection);
		}
	}, [connection, status]);
	const hasConnected =
		status === "open" ||
		(connection !== null && openedConnection === connection);
	return { hasConnected, status };
}
