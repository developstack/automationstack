import type { FeedEntry } from "@automationstack/db/repositories/project-stats-activity-core";
import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/components/cases/case-meta";
import {
	feedSummary,
	feedVersionLabel,
	formatFeedTime,
} from "@/components/overview/activity-feed-meta";

const NOW = new Date("2026-11-19T12:00:00.000Z");
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): Date {
	return new Date(NOW.getTime() - ms);
}

describe("formatFeedTime", () => {
	it.each<[string, number, string]>([
		["30 秒", 30 * SECOND, "刚刚"],
		["59 秒", 59 * SECOND, "刚刚"],
		["1 分钟", MINUTE, "1分钟前"],
		["59 分钟", 59 * MINUTE, "59分钟前"],
		["1 小时", HOUR, "1小时前"],
		["23 小时", 23 * HOUR, "23小时前"],
		["1 天", DAY, "昨天"],
		["6 天", 6 * DAY, "6天前"],
	])("%s前：%s", (_name, elapsed, expected) => {
		expect(formatFeedTime(ago(elapsed), NOW)).toBe(expected);
	});

	it("7 天以前显示日期和时间，也接受字符串", () => {
		const at = ago(7 * DAY);
		expect(formatFeedTime(at, NOW)).toBe(formatDateTime(at));
		expect(formatFeedTime(at.toISOString(), NOW)).toBe(formatDateTime(at));
	});
});

describe("feedSummary", () => {
	it.each<[FeedEntry["action"], number, string]>([
		["updated", 1, "修改了"],
		["deleted", 1, "删除了"],
		["deleted", 12, "删除了 12 条用例"],
		["updated", 2, "修改了 2 条用例"],
	])("%s %d 条：%s", (action, caseCount, expected) => {
		expect(feedSummary({ action, caseCount } as FeedEntry)).toBe(expected);
	});
});

describe("feedVersionLabel", () => {
	it.each<[FeedEntry["action"], number, string]>([
		["updated", 4, "v3 → v4"],
		["updated", 1, "v1"],
		["deleted", 4, "v4"],
	])("%s v%d：%s", (action, version, expected) => {
		expect(feedVersionLabel(action, version)).toBe(expected);
	});
});
