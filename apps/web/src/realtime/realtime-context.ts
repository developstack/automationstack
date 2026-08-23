import { createContext, useContext } from "react";

import type { RealtimeConnection, RealtimeStatus } from "./connection";
import type { PresenceStore } from "./presence-store";

export interface RealtimeContextValue {
	/** 本 Tab 的 clientId；SSR/未水合时为 null。 */
	clientId: string | null;
	/** 连接未建立时为 null。 */
	connection: RealtimeConnection | null;
	presenceStore: PresenceStore;
	status: RealtimeStatus;
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/** 读取实时上下文；不在 Provider 内时返回 null（组件自行降级）。 */
export function useRealtime(): RealtimeContextValue | null {
	return useContext(RealtimeContext);
}
