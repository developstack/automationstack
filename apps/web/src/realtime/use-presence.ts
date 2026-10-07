import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import { useSyncExternalStore } from "react";

import { EMPTY_PRESENCE, PresenceStore } from "./presence-store";
import { useRealtime } from "./realtime-context";

const fallbackStore = new PresenceStore();

const getEmptySnapshot = (): PresenceEntry[] => EMPTY_PRESENCE;

export function usePresence(): PresenceEntry[] {
	const store = useRealtime()?.presenceStore ?? fallbackStore;
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		getEmptySnapshot
	);
}
