import type {
	FeedAction,
	FeedEntry,
} from "@automationstack/db/repositories/project-stats-activity-core";

import { formatDateTime } from "@/components/cases/case-meta";
import { formatCount } from "@/components/overview/overview-metrics";

const ACTION_VERBS: Record<FeedAction, string> = {
	deleted: "删除了",
	updated: "修改了",
};

/** 操作人的用户已经删除、或者名称没有记录时显示的名称。 */
export const UNKNOWN_ACTOR = "未知用户";

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("zh-CN", {
	numeric: "auto",
});

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** 超过这个天数时，显示日期和时间，不显示「N 天前」。 */
const RELATIVE_DAYS_LIMIT = 7;

/** 「刚刚」「3 分钟前」「2 小时前」「昨天」；7 天以前显示日期和时间。 */
export function formatFeedTime(at: Date | string, now: Date): string {
	const elapsed = now.getTime() - new Date(at).getTime();
	if (elapsed < MINUTE_MS) {
		return "刚刚";
	}
	if (elapsed < HOUR_MS) {
		return RELATIVE_FORMAT.format(-Math.floor(elapsed / MINUTE_MS), "minute");
	}
	if (elapsed < DAY_MS) {
		return RELATIVE_FORMAT.format(-Math.floor(elapsed / HOUR_MS), "hour");
	}
	if (elapsed < RELATIVE_DAYS_LIMIT * DAY_MS) {
		return RELATIVE_FORMAT.format(-Math.floor(elapsed / DAY_MS), "day");
	}
	return formatDateTime(at);
}

/** 日志的第一行，不包括操作人。一条用例时只有动作，用例名称在下一行：「修改了」或「删除了 12 条用例」。 */
export function feedSummary(entry: FeedEntry): string {
	const verb = ACTION_VERBS[entry.action];
	return entry.caseCount === 1
		? verb
		: `${verb} ${formatCount(entry.caseCount)} 条用例`;
}

/** 修改：「v3 → v4」。删除：删除前的版本「v4」。 */
export function feedVersionLabel(action: FeedAction, version: number): string {
	return action === "updated" && version > 1
		? `v${version - 1} → v${version}`
		: `v${version}`;
}
