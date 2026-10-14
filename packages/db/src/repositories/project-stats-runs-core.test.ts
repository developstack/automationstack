import { describe, expect, it } from "vitest";

import { daysAgo, NOW } from "./project-stats-fixtures";
import { type ActiveRunRow, buildActiveRuns } from "./project-stats-runs-core";

const NO_RESULTS = {
	blocked: 0,
	failed: 0,
	passed: 0,
	skipped: 0,
	untested: 0,
};

function run(overrides: Partial<ActiveRunRow> & { id: string }): ActiveRunRow {
	return {
		counts: NO_RESULTS,
		createdAt: daysAgo(1),
		lastExecutedAt: null,
		name: `测试任务 ${overrides.id}`,
		status: "in_progress",
		...overrides,
	};
}

describe("buildActiveRuns", () => {
	it("没有进行中的测试任务时，列表为空，总数和停滞数都是 0", () => {
		expect(buildActiveRuns({ now: NOW, runs: [] })).toEqual({
			runs: [],
			stalledCount: 0,
			totalCount: 0,
		});
	});

	it("有结论的条数不包含未测；阻塞和跳过也算有结论", () => {
		const [summary] = buildActiveRuns({
			now: NOW,
			runs: [
				run({
					counts: { blocked: 1, failed: 2, passed: 3, skipped: 1, untested: 3 },
					id: "a",
				}),
			],
		}).runs;

		expect(summary?.caseCount).toBe(10);
		expect(summary?.concludedCount).toBe(7);
	});

	it("距上次执行的天数用最后的执行时间；没有执行结果时用创建时间", () => {
		const { runs } = buildActiveRuns({
			now: NOW,
			runs: [
				run({ id: "executed", lastExecutedAt: daysAgo(3, 1) }),
				run({ createdAt: daysAgo(5), id: "fresh" }),
			],
		});

		expect(runs.find((r) => r.id === "executed")?.daysSinceLastExecution).toBe(
			3
		);
		expect(runs.find((r) => r.id === "fresh")?.daysSinceLastExecution).toBe(5);
		expect(runs.find((r) => r.id === "fresh")?.lastExecutedAt).toBeNull();
		expect(runs.find((r) => r.id === "executed")?.lastExecutedAt).toEqual(
			daysAgo(3, 1)
		);
	});

	it("待测试或测试中的测试任务，超过 7 天没有新的执行结果时停滞；正好 7 天不算", () => {
		const { runs, stalledCount } = buildActiveRuns({
			now: NOW,
			runs: [
				run({ id: "exactly7", lastExecutedAt: daysAgo(7) }),
				run({ id: "over7", lastExecutedAt: daysAgo(7, 1) }),
				run({ id: "ready", lastExecutedAt: daysAgo(10), status: "ready" }),
			],
		});

		expect(runs.find((r) => r.id === "exactly7")?.stalled).toBe(false);
		expect(runs.find((r) => r.id === "over7")?.stalled).toBe(true);
		expect(runs.find((r) => r.id === "ready")?.stalled).toBe(true);
		expect(stalledCount).toBe(2);
	});

	it("待评审和已完成的测试任务不会停滞", () => {
		const { stalledCount } = buildActiveRuns({
			now: NOW,
			runs: [
				run({ createdAt: daysAgo(30), id: "review", status: "pending_review" }),
				run({ id: "done", lastExecutedAt: daysAgo(30), status: "completed" }),
			],
		});

		expect(stalledCount).toBe(0);
	});

	it("先显示停滞的测试任务，再按创建时间从新到旧；最多 5 行，总数包含全部", () => {
		const { runs, totalCount } = buildActiveRuns({
			now: NOW,
			runs: [
				run({ createdAt: daysAgo(1), id: "new" }),
				run({ createdAt: daysAgo(2), id: "older" }),
				run({
					createdAt: daysAgo(40),
					id: "stalled",
					lastExecutedAt: daysAgo(9),
				}),
				run({ createdAt: daysAgo(3), id: "r3" }),
				run({ createdAt: daysAgo(4), id: "r4" }),
				run({ createdAt: daysAgo(5), id: "r5" }),
			],
		});

		expect(runs.map((r) => r.id)).toEqual([
			"stalled",
			"new",
			"older",
			"r3",
			"r4",
		]);
		expect(totalCount).toBe(6);
	});
});
