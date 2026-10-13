import { describe, expect, it } from "vitest";

import {
	formatCount,
	matrixCells,
	orderModuleTree,
	overviewSummary,
} from "@/components/overview/overview-metrics";

describe("formatCount", () => {
	it("用千分位逗号显示大数字", () => {
		expect(formatCount(1284)).toBe("1,284");
	});
});

describe("overviewSummary", () => {
	it("有陈旧的高优先级用例时，说出用例总数和陈旧条数", () => {
		expect(
			overviewSummary({ staleTotal: 37, thresholdDays: 30, totalCases: 1284 })
		).toBe("本项目 1,284 条用例，其中 37 条 P0/P1 用例超过 30 天没有更新");
	});

	it("没有陈旧的高优先级用例时，说明都在期限内更新过", () => {
		expect(
			overviewSummary({ staleTotal: 0, thresholdDays: 90, totalCases: 12 })
		).toBe("本项目 12 条用例，P0/P1 用例都在 90 天内更新过");
	});

	it("没有用例时，说明还没有用例", () => {
		expect(
			overviewSummary({ staleTotal: 0, thresholdDays: 90, totalCases: 0 })
		).toBe("本项目还没有用例");
	});
});

describe("matrixCells", () => {
	it("200 条以内，一个方格表示一条用例", () => {
		expect(matrixCells({ activeCount: 35, caseCount: 38 })).toEqual({
			activeCells: 35,
			casesPerCell: 1,
			otherCells: 3,
		});
	});

	it("超过 200 条，一个方格表示多条用例，方格不超过 200 个", () => {
		const cells = matrixCells({ activeCount: 500, caseCount: 1000 });

		expect(cells.casesPerCell).toBe(5);
		expect(cells.activeCells + cells.otherCells).toBe(200);
		expect(cells.activeCells).toBe(100);
	});

	it("合并后，只要有生效用例和其他用例，各自至少保留一个方格", () => {
		const fewActive = matrixCells({ activeCount: 1, caseCount: 1000 });
		const fewOther = matrixCells({ activeCount: 999, caseCount: 1000 });

		expect(fewActive.activeCells).toBe(1);
		expect(fewOther.otherCells).toBe(1);
	});

	it("零用例的模块没有方格", () => {
		expect(matrixCells({ activeCount: 0, caseCount: 0 })).toEqual({
			activeCells: 0,
			casesPerCell: 1,
			otherCells: 0,
		});
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

	it("同级模块保持原来的顺序", () => {
		const ordered = orderModuleTree([
			{ moduleId: "a", parentId: null },
			{ moduleId: "a2", parentId: "a" },
			{ moduleId: "a1", parentId: "a" },
		]);

		expect(ordered.map((row) => row.moduleId)).toEqual(["a", "a2", "a1"]);
	});

	it("找不到父模块的模块放在第一层", () => {
		const ordered = orderModuleTree([{ moduleId: "x", parentId: "missing" }]);

		expect(ordered).toEqual([{ depth: 0, moduleId: "x", parentId: "missing" }]);
	});
});
