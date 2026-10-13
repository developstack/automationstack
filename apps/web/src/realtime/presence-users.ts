import type { PresenceEntry } from "@automationstack/api/realtime/protocol";

/** 在线名单里识别「同一个用户」的键。人数统计和头像去重都用它。 */
export const presenceUserKey = (entry: Pick<PresenceEntry, "name">): string =>
	entry.name;

/**
 * 在线名单里每个用户只留一项，按第一次出现的顺序。
 * 自己的用户名保留自己这个标签页的那一项，「（我）」和所在页面才对得上。
 */
export function uniquePresenceUsers(
	entries: readonly PresenceEntry[],
	selfClientId: string | null
): readonly PresenceEntry[] {
	const byUser = new Map<string, PresenceEntry>();
	for (const entry of entries) {
		const key = presenceUserKey(entry);
		// Map 覆盖已有的键时不改变顺序，所以自己那一项仍在该用户第一次出现的位置。
		if (!byUser.has(key) || entry.clientId === selfClientId) {
			byUser.set(key, entry);
		}
	}
	// 没有重复时自己那一项不会被替换，原数组就是结果，保留引用。
	if (byUser.size === entries.length) {
		return entries;
	}
	return [...byUser.values()];
}
