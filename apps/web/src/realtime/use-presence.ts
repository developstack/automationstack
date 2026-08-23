import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import { useSyncExternalStore } from "react";

import { EMPTY_PRESENCE, PresenceStore } from "./presence-store";
import { useRealtime } from "./realtime-context";

/** Provider 缺失时的空 store：保证 hook 参数引用稳定。 */
const fallbackStore = new PresenceStore();

const getEmptySnapshot = (): PresenceEntry[] => EMPTY_PRESENCE;

/** 当前项目全部在线成员（含自己），按加入时间排序。 */
export function usePresence(): PresenceEntry[] {
	const store = useRealtime()?.presenceStore ?? fallbackStore;
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		getEmptySnapshot
	);
}
