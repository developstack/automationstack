import { describe, expect, it } from "vitest";

import { daysAgo, NOW } from "./project-stats-fixtures";
import {
	buildCaseTrend,
	buildExecutionTrend,
	buildRunTrend,
} from "./project-stats-trend-core";

function caseTrend(
	caseCreatedAt: Date[],
	modifiedVersions: { caseId: string; createdAt: Date }[] = []
) {
	return buildCaseTrend({ caseCreatedAt, modifiedVersions, now: NOW });
}

describe("buildCaseTrend", () => {
	it("空项目：12 个 7 天区间都是 0，过去 7 天新增和修改都是 0；最后一个区间是过去 7 天，结束于现在；第一个区间从 84 天前开始", () => {
		const trend = caseTrend([]);

		expect(trend.points).toHaveLength(12);
		expect(trend.points.every((point) => point.created === 0)).toBe(true);
		expect(trend.createdLast7Days).toBe(0);
		expect(trend.createdPrevious7Days).toBe(0);
		expect(trend.modifiedLast7Days).toBe(0);
		expect(trend.points.at(-1)?.end).toEqual(NOW);
		expect(trend.points.at(-1)?.start).toEqual(daysAgo(7));
		expect(trend.points[0]?.start).toEqual(daysAgo(84));
	});

	it("正好 7 天前创建的用例算进过去 7 天；早 1 毫秒算进前 7 天", () => {
		const trend = caseTrend([daysAgo(7), daysAgo(7, 1)]);

		expect(trend.createdLast7Days).toBe(1);
		expect(trend.createdPrevious7Days).toBe(1);
		expect(trend.points.at(-1)?.created).toBe(1);
		expect(trend.points.at(-2)?.created).toBe(1);
	});

	it("正好 84 天前创建的用例在第一个区间；更早的不统计", () => {
		const trend = caseTrend([daysAgo(84), daysAgo(84, 1), daysAgo(200)]);

		expect(trend.points[0]?.created).toBe(1);
		expect(trend.points.reduce((sum, point) => sum + point.created, 0)).toBe(1);
	});

	it("时钟偏差导致晚于现在的创建时间算进过去 7 天", () => {
		expect(caseTrend([new Date(NOW.getTime() + 1000)]).createdLast7Days).toBe(
			1
		);
	});

	it("过去 7 天修改按用例去重，不统计 7 天以前的版本", () => {
		const trend = caseTrend(
			[],
			[
				{ caseId: "a", createdAt: daysAgo(1) },
				{ caseId: "a", createdAt: daysAgo(2) },
				{ caseId: "b", createdAt: daysAgo(7) },
				{ caseId: "c", createdAt: daysAgo(7, 1) },
			]
		);

		expect(trend.modifiedLast7Days).toBe(2);
	});
});

describe("buildExecutionTrend", () => {
	it("空项目：12 个区间，每种执行结果都是 0", () => {
		const { points } = buildExecutionTrend({ executions: [], now: NOW });

		expect(points).toHaveLength(12);
		expect(points.at(-1)).toMatchObject({
			blocked: 0,
			failed: 0,
			passed: 0,
			skipped: 0,
		});
	});

	it("按区间和执行结果计数，阻塞和跳过单独成段", () => {
		const { points } = buildExecutionTrend({
			executions: [
				{ executedAt: daysAgo(1), result: "passed" },
				{ executedAt: daysAgo(2), result: "failed" },
				{ executedAt: daysAgo(3), result: "blocked" },
				{ executedAt: daysAgo(7), result: "skipped" },
				{ executedAt: daysAgo(7, 1), result: "passed" },
			],
			now: NOW,
		});

		expect(points.at(-1)).toMatchObject({
			blocked: 1,
			failed: 1,
			passed: 1,
			skipped: 1,
		});
		expect(points.at(-2)).toMatchObject({ passed: 1 });
	});

	it("未测不是有结论的执行结果，不计数；84 天以前的执行不计数", () => {
		const { points } = buildExecutionTrend({
			executions: [
				{ executedAt: daysAgo(1), result: "untested" },
				{ executedAt: daysAgo(84, 1), result: "passed" },
			],
			now: NOW,
		});

		const total = points.reduce(
			(sum, point) =>
				sum + point.passed + point.failed + point.blocked + point.skipped,
			0
		);
		expect(total).toBe(0);
	});
});

describe("buildRunTrend", () => {
	it("空项目：12 个区间，新建和完成都是 0", () => {
		const trend = buildRunTrend({ now: NOW, runs: [] });

		expect(trend.points).toHaveLength(12);
		expect(trend.points.every((p) => p.created + p.completed === 0)).toBe(true);
		expect(trend.completedLast7Days).toBe(0);
	});

	it("新建按 created_at 计数，完成按 completed_at 计数", () => {
		const trend = buildRunTrend({
			now: NOW,
			runs: [
				{
					completedAt: daysAgo(1),
					createdAt: daysAgo(20),
					status: "completed",
				},
				{ completedAt: daysAgo(7), createdAt: daysAgo(8), status: "submitted" },
				{ completedAt: null, createdAt: daysAgo(2), status: "in_progress" },
			],
		});

		expect(trend.points.at(-1)).toMatchObject({ completed: 2, created: 1 });
		expect(trend.points.at(-2)).toMatchObject({ completed: 0, created: 1 });
		expect(trend.completedLast7Days).toBe(2);
	});

	it("回到测试中的测试任务不算完成，即使 completed_at 还有值", () => {
		const trend = buildRunTrend({
			now: NOW,
			runs: [
				{
					completedAt: daysAgo(1),
					createdAt: daysAgo(100),
					status: "in_progress",
				},
			],
		});

		expect(trend.completedLast7Days).toBe(0);
		expect(trend.points.every((p) => p.created === 0)).toBe(true);
	});
});
