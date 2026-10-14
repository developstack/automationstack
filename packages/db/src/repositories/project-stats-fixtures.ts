const DAY_MS = 86_400_000;

/** project-stats-*-core 测试共用的「现在」。 */
export const NOW = new Date("2026-10-13T12:00:00.000Z");

/** NOW 之前 days 天、再早 extraMs 毫秒的时刻。 */
export function daysAgo(days: number, extraMs = 0): Date {
	return new Date(NOW.getTime() - days * DAY_MS - extraMs);
}
