import { describe, expect, it } from "vitest";

import {
	buildExecutionCoverage,
	type CoverageCaseRow,
	type CoverageExecutionRow,
} from "./project-stats-execution-core";
import { daysAgo, NOW } from "./project-stats-fixtures";

const ROOT_A = "root-a";
const CHILD_A = "child-a";
const ROOT_B = "root-b";
const MODULES = [
	{ id: ROOT_A, name: "登录", parentId: null },
	{ id: CHILD_A, name: "短信登录", parentId: ROOT_A },
	{ id: ROOT_B, name: "支付", parentId: null },
];

function activeCase(
	id: string,
	overrides: Partial<CoverageCaseRow> = {}
): CoverageCaseRow {
	return { id, moduleId: ROOT_A, priority: "P2", ...overrides };
}

function coverage(
	cases: CoverageCaseRow[],
	executions: CoverageExecutionRow[] = [],
	modules = MODULES
) {
	return buildExecutionCoverage({ cases, executions, modules, now: NOW });
}

describe("buildExecutionCoverage", () => {
	it("空项目：没有生效用例，没有模块条形，也没有待执行的 P0/P1 用例", () => {
		expect(coverage([], [], [])).toEqual({
			activeCount: 0,
			executedCount: 0,
			highPriorityActiveCount: 0,
			highPriorityExecutedCount: 0,
			modules: [],
			unexecutedHighPriority: { items: [], total: 0 },
			unexecutedModuleCount: 0,
		});
	});

	it("通过和失败算已执行；阻塞和跳过不算已执行", () => {
		const result = coverage(
			[
				activeCase("pass"),
				activeCase("fail"),
				activeCase("block"),
				activeCase("skip"),
			],
			[
				{ caseId: "pass", lastAt: daysAgo(1), result: "passed" },
				{ caseId: "fail", lastAt: daysAgo(1), result: "failed" },
				{ caseId: "block", lastAt: daysAgo(1), result: "blocked" },
				{ caseId: "skip", lastAt: daysAgo(1), result: "skipped" },
			]
		);

		expect(result.activeCount).toBe(4);
		expect(result.executedCount).toBe(2);
	});

	it("正好 30 天前执行的用例算在窗口内；早 1 毫秒不算", () => {
		const result = coverage(
			[activeCase("edge"), activeCase("outside")],
			[
				{ caseId: "edge", lastAt: daysAgo(30), result: "passed" },
				{ caseId: "outside", lastAt: daysAgo(30, 1), result: "passed" },
			]
		);

		expect(result.executedCount).toBe(1);
	});

	it("第二个环只统计 P0/P1 生效用例", () => {
		const result = coverage(
			[
				activeCase("p0", { priority: "P0" }),
				activeCase("p1", { priority: "P1" }),
				activeCase("p2", { priority: "P2" }),
			],
			[
				{ caseId: "p0", lastAt: daysAgo(2), result: "failed" },
				{ caseId: "p2", lastAt: daysAgo(2), result: "passed" },
			]
		);

		expect(result.highPriorityActiveCount).toBe(2);
		expect(result.highPriorityExecutedCount).toBe(1);
	});

	it("没有执行的用例汇总到第一层模块，按条数从多到少，没有缺口的模块不列出", () => {
		const result = coverage([
			activeCase("a1", { moduleId: ROOT_A }),
			activeCase("a2", { moduleId: CHILD_A }),
			activeCase("b1", { moduleId: ROOT_B }),
			activeCase("b2", { moduleId: ROOT_B }),
			activeCase("b3", { moduleId: ROOT_B }),
		]);

		expect(result.modules).toEqual([
			{ moduleId: ROOT_B, name: "支付", unexecutedCount: 3 },
			{ moduleId: ROOT_A, name: "登录", unexecutedCount: 2 },
		]);
		expect(result.unexecutedModuleCount).toBe(2);
	});

	it("模块条形最多 8 个，unexecutedModuleCount 是全部有缺口的第一层模块数", () => {
		const modules = Array.from({ length: 10 }, (_, index) => ({
			id: `m${index}`,
			name: `模块 ${index}`,
			parentId: null,
		}));
		const result = coverage(
			modules.map((module) => activeCase(module.id, { moduleId: module.id })),
			[],
			modules
		);

		expect(result.modules).toHaveLength(8);
		expect(result.unexecutedModuleCount).toBe(10);
	});

	it("列出过去 90 天没有执行的 P0/P1 用例：从来没有执行的在最前面，再按上次执行从早到晚", () => {
		const result = coverage(
			[
				activeCase("recent", { priority: "P0" }),
				activeCase("edge", { priority: "P0" }),
				activeCase("old", { priority: "P1" }),
				activeCase("older", { priority: "P1" }),
				activeCase("never", { priority: "P0" }),
				activeCase("blocked-only", { priority: "P1" }),
				activeCase("low", { priority: "P3" }),
			],
			[
				{ caseId: "recent", lastAt: daysAgo(10), result: "passed" },
				{ caseId: "edge", lastAt: daysAgo(90), result: "passed" },
				{ caseId: "old", lastAt: daysAgo(90, 1), result: "passed" },
				{ caseId: "older", lastAt: daysAgo(200), result: "failed" },
				{ caseId: "blocked-only", lastAt: daysAgo(1), result: "blocked" },
			]
		);

		expect(result.unexecutedHighPriority.total).toBe(4);
		expect(
			result.unexecutedHighPriority.items.map((item) => [
				item.id,
				item.lastExecutedAt,
			])
		).toEqual([
			["never", null],
			["blocked-only", null],
			["older", daysAgo(200)],
			["old", daysAgo(90, 1)],
		]);
	});

	it("待执行的 P0/P1 用例最多列出 10 条", () => {
		const cases = Array.from({ length: 12 }, (_, index) =>
			activeCase(`c${index}`, { priority: "P0" })
		);

		const result = coverage(cases);

		expect(result.unexecutedHighPriority.items).toHaveLength(10);
		expect(result.unexecutedHighPriority.total).toBe(12);
	});
});
