import { describe, expect, it } from "vitest";

import {
	activeRunsDescription,
	compareWithPrevious,
	coverageGapRows,
	formatCount,
	formatTrendRange,
	orderModuleTree,
	overviewSummary,
	runIdleText,
	sharePercent,
} from "@/components/overview/overview-metrics";

describe("formatCount", () => {
	it("用千分位逗号显示大数字", () => {
		expect(formatCount(1284)).toBe("1,284");
	});
});

describe("sharePercent", () => {
	it("四舍五入到整数百分比；分母为 0 时是 0", () => {
		expect(sharePercent(2, 3)).toBe(67);
		expect(sharePercent(0, 0)).toBe(0);
	});
});

describe("overviewSummary", () => {
	const base = {
		activeCount: 1204,
		activeRunCount: 3,
		executedCount: 819,
		stalledRunCount: 1,
		totalCases: 1500,
	};

	it.each([
		[
			"说出生效用例、执行覆盖率、进行中和停滞的测试任务",
			{},
			"生效用例 1,204 条，过去 30 天执行了 68%；3 个测试任务进行中，1 个超过 7 天没有新的执行结果。",
		],
		[
			"没有停滞的测试任务时，删除停滞的部分",
			{ stalledRunCount: 0 },
			"生效用例 1,204 条，过去 30 天执行了 68%；3 个测试任务进行中。",
		],
		[
			"没有进行中的测试任务时，后半句说明没有",
			{ activeRunCount: 0, stalledRunCount: 0 },
			"生效用例 1,204 条，过去 30 天执行了 68%；没有进行中的测试任务。",
		],
		[
			"有用例但没有生效用例时，不说执行覆盖率",
			{ activeCount: 0, executedCount: 0 },
			"还没有生效用例；3 个测试任务进行中，1 个超过 7 天没有新的执行结果。",
		],
		["没有用例时，说明本项目还没有用例", { totalCases: 0 }, "本项目还没有用例"],
	])("%s", (_name, patch, summary) => {
		expect(overviewSummary({ ...base, ...patch })).toBe(summary);
	});
});

describe("activeRunsDescription", () => {
	it.each([
		[
			"没有停滞的测试任务",
			{ stalledCount: 0, totalCount: 1204 },
			"1,204 个测试任务还没有提交（不含已作废），停滞的测试任务排在最前面",
		],
		[
			"有停滞的测试任务",
			{ stalledCount: 2, totalCount: 3 },
			"3 个测试任务还没有提交（不含已作废），2 个超过 7 天没有新的执行结果，排在最前面",
		],
	])("%s：条数写明不含已作废的测试任务", (_name, stats, description) => {
		expect(activeRunsDescription(stats)).toBe(description);
	});
});

describe("compareWithPrevious", () => {
	it("说出比前 7 天多或少的条数", () => {
		expect(compareWithPrevious(15, 3)).toBe("比前 7 天多 12 条");
		expect(compareWithPrevious(2, 5)).toBe("比前 7 天少 3 条");
		expect(compareWithPrevious(4, 4)).toBe("与前 7 天相同");
	});
});

describe("runIdleText", () => {
	it("有执行结果时说出距上次执行的天数", () => {
		expect(runIdleText({ daysSinceLastExecution: 3, executed: true })).toBe(
			"距上次执行 3 天"
		);
		expect(runIdleText({ daysSinceLastExecution: 0, executed: true })).toBe(
			"今天有执行结果"
		);
	});

	it("没有执行结果时说出创建了几天", () => {
		expect(runIdleText({ daysSinceLastExecution: 5, executed: false })).toBe(
			"创建 5 天，还没有执行结果"
		);
	});
});

describe("formatTrendRange", () => {
	it("用月/日显示 7 天区间的开始和结束", () => {
		expect(
			formatTrendRange(new Date(2026, 9, 6, 12), new Date(2026, 9, 13, 12))
		).toBe("10/06–10/13");
	});
});

describe("orderModuleTree", () => {
	it("按树的先序排列模块，并给出层级", () => {
		const ordered = orderModuleTree([
			{ moduleId: "a", parentId: null },
			{ moduleId: "b", parentId: null },
			{ moduleId: "a1", parentId: "a" },
			{ moduleId: "a1x", parentId: "a1" },
		]);

		expect(ordered.map((row) => [row.moduleId, row.depth])).toEqual([
			["a", 0],
			["a1", 1],
			["a1x", 2],
			["b", 0],
		]);
	});

	it("找不到父模块的模块放在第一层", () => {
		const ordered = orderModuleTree([{ moduleId: "x", parentId: "missing" }]);

		expect(ordered).toEqual([{ depth: 0, moduleId: "x", parentId: "missing" }]);
	});
});

describe("coverageGapRows", () => {
	function module(
		moduleId: string,
		parentId: string | null,
		gap: "empty" | "no-active" | null,
		caseCount = 0
	) {
		return { caseCount, gap, moduleId, name: moduleId.toUpperCase(), parentId };
	}

	it("只列出有缺口的模块，并给出从第一层开始的模块路径", () => {
		const rows = coverageGapRows([
			module("a", null, null, 5),
			module("a1", "a", "empty"),
			module("a2", "a", null, 5),
			module("b", null, "no-active", 2),
		]);

		expect(rows).toEqual([
			{ caseCount: 0, gap: "empty", moduleId: "a1", path: "A / A1" },
			{ caseCount: 2, gap: "no-active", moduleId: "b", path: "B" },
		]);
	});

	it("父模块和子模块都有缺口时，只列出父模块", () => {
		const rows = coverageGapRows([
			module("a", null, "empty"),
			module("a1", "a", "empty"),
			module("a1x", "a1", "empty"),
		]);

		expect(rows.map((row) => row.moduleId)).toEqual(["a"]);
	});

	it("没有模块时没有行", () => {
		expect(coverageGapRows([])).toEqual([]);
	});
});
