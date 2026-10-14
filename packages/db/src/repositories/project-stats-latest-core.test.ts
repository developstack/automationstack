import { describe, expect, it } from "vitest";

import type { CasePriority } from "../schema/test-cases";
import type { TestRunCaseResult } from "../schema/test-run-enums";
import { daysAgo, NOW } from "./project-stats-fixtures";
import {
	buildLatestResults,
	type LatestResultRow,
} from "./project-stats-latest-core";

function execution(
	caseId: string,
	executedAt: Date,
	result: TestRunCaseResult,
	priority: CasePriority = "P2"
): LatestResultRow {
	return { caseId, executedAt, priority, result };
}

function latest(...executions: LatestResultRow[]) {
	return buildLatestResults({ executions, now: NOW });
}

describe("buildLatestResults", () => {
	it("空项目：每种执行结果都是 0", () => {
		expect(latest()).toEqual({
			caseCount: 0,
			counts: { blocked: 0, failed: 0, passed: 0, skipped: 0 },
			failedOrBlockedCount: 0,
			highPriorityFailedCount: 0,
		});
	});

	it("一条用例在多个测试任务中执行时，只取最新的执行结果，只计算一次", () => {
		const stats = latest(
			execution("a", daysAgo(2), "passed"),
			execution("a", daysAgo(10), "failed"),
			execution("b", daysAgo(9), "failed"),
			execution("b", daysAgo(3), "blocked")
		);

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
		const stats = latest(
			execution("edge", daysAgo(30), "failed"),
			execution("out", daysAgo(30, 1), "failed")
		);

		expect(stats.caseCount).toBe(1);
		expect(stats.counts.failed).toBe(1);
	});

	it("未测不是有结论的执行结果，不统计", () => {
		const stats = latest(
			execution("a", daysAgo(1), "untested"),
			execution("a", daysAgo(5), "skipped")
		);

		expect(stats.counts).toEqual({
			blocked: 0,
			failed: 0,
			passed: 0,
			skipped: 1,
		});
	});

	it("补充数字只统计最新执行结果是失败的 P0/P1 用例", () => {
		const stats = latest(
			execution("p0", daysAgo(1), "failed", "P0"),
			execution("p1", daysAgo(1), "blocked", "P1"),
			execution("p1b", daysAgo(1), "passed", "P1"),
			execution("p1b", daysAgo(4), "failed", "P1"),
			execution("p2", daysAgo(1), "failed")
		);

		expect(stats.highPriorityFailedCount).toBe(1);
		expect(stats.failedOrBlockedCount).toBe(3);
	});
});
