import { describe, expect, it } from "vitest";

import { buildLatestResults } from "./project-stats-latest-core";

const NOW = new Date("2026-10-13T12:00:00.000Z");
const DAY = 86_400_000;

function daysAgo(days: number, extraMs = 0): Date {
	return new Date(NOW.getTime() - days * DAY - extraMs);
}

describe("buildLatestResults", () => {
	it("空项目：每种执行结果都是 0", () => {
		expect(buildLatestResults({ executions: [], now: NOW })).toEqual({
			caseCount: 0,
			counts: { blocked: 0, failed: 0, passed: 0, skipped: 0 },
			failedOrBlockedCount: 0,
			highPriorityFailedCount: 0,
		});
	});

	it("一条用例在多个测试任务中执行时，只取最新的执行结果，只计算一次", () => {
		const stats = buildLatestResults({
			executions: [
				{
					caseId: "a",
					executedAt: daysAgo(2),
					priority: "P2",
					result: "passed",
				},
				{
					caseId: "a",
					executedAt: daysAgo(10),
					priority: "P2",
					result: "failed",
				},
				{
					caseId: "b",
					executedAt: daysAgo(9),
					priority: "P2",
					result: "failed",
				},
				{
					caseId: "b",
					executedAt: daysAgo(3),
					priority: "P2",
					result: "blocked",
				},
			],
			now: NOW,
		});

		expect(stats.caseCount).toBe(2);
		expect(stats.counts).toEqual({
			blocked: 1,
			failed: 0,
			passed: 1,
			skipped: 0,
		});
		expect(stats.failedOrBlockedCount).toBe(1);
	});

	it("正好 30 天前的执行结果在窗口内；早 1 毫秒的不统计，也不能覆盖窗口内的结果", () => {
		const stats = buildLatestResults({
			executions: [
				{
					caseId: "edge",
					executedAt: daysAgo(30),
					priority: "P2",
					result: "failed",
				},
				{
					caseId: "out",
					executedAt: daysAgo(30, 1),
					priority: "P2",
					result: "failed",
				},
			],
			now: NOW,
		});

		expect(stats.caseCount).toBe(1);
		expect(stats.counts.failed).toBe(1);
	});

	it("未测不是有结论的执行结果，不统计", () => {
		const stats = buildLatestResults({
			executions: [
				{
					caseId: "a",
					executedAt: daysAgo(1),
					priority: "P2",
					result: "untested",
				},
				{
					caseId: "a",
					executedAt: daysAgo(5),
					priority: "P2",
					result: "skipped",
				},
			],
			now: NOW,
		});

		expect(stats.counts).toEqual({
			blocked: 0,
			failed: 0,
			passed: 0,
			skipped: 1,
		});
	});

	it("补充数字只统计最新执行结果是失败的 P0/P1 用例", () => {
		const stats = buildLatestResults({
			executions: [
				{
					caseId: "p0",
					executedAt: daysAgo(1),
					priority: "P0",
					result: "failed",
				},
				{
					caseId: "p1",
					executedAt: daysAgo(1),
					priority: "P1",
					result: "blocked",
				},
				{
					caseId: "p1b",
					executedAt: daysAgo(1),
					priority: "P1",
					result: "passed",
				},
				{
					caseId: "p1b",
					executedAt: daysAgo(4),
					priority: "P1",
					result: "failed",
				},
				{
					caseId: "p2",
					executedAt: daysAgo(1),
					priority: "P2",
					result: "failed",
				},
			],
			now: NOW,
		});

		expect(stats.highPriorityFailedCount).toBe(1);
		expect(stats.failedOrBlockedCount).toBe(3);
	});
});
