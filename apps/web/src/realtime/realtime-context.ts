import { createContext, useContext } from "react";

import type { RealtimeConnection, RealtimeStatus } from "./connection";
import type { PresenceStore } from "./presence-store";

export interface RealtimeContextValue {
	clientId: string | null;
	connection: RealtimeConnection | null;
	presenceStore: PresenceStore;
	status: RealtimeStatus;
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime(): RealtimeContextValue | null {
	return useContext(RealtimeContext);
}
