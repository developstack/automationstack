import { describe, expect, it } from "vitest";

import { planCaseMove } from "./case-move-core";

const TARGET = "m-target";

function row(id: string, moduleId: string, sortOrder: number) {
	return { id, moduleId, sortOrder };
}

describe("planCaseMove：批量移动用例到一个模块", () => {
	it("分为移动、不变和不存在；同一原模块的用例保持原来的顺序", () => {
		const locked = [
			row("c1", "m-b", 2),
			row("c2", TARGET, 0),
			row("c3", "m-a", 5),
			row("c4", "m-b", 0),
			row("c5", "m-a", 1),
		];
		const plan = planCaseMove(
			["c1", "c2", "c3", "c4", "c5", "gone", "gone"],
			locked,
			TARGET
		);
		expect(plan.movable.map((testCase) => testCase.id)).toEqual([
			"c5",
			"c3",
			"c4",
			"c1",
		]);
		expect(plan.unchanged.map((testCase) => testCase.id)).toEqual(["c2"]);
		expect(plan.missingIds).toEqual(["gone"]);
	});

	it("没有加锁的用例时什么都不移动", () => {
		expect(planCaseMove(["c1"], [], TARGET)).toEqual({
			missingIds: ["c1"],
			movable: [],
			unchanged: [],
		});
	});
});
