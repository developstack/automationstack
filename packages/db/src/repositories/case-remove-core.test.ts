import { describe, expect, it } from "vitest";

import { type CaseRemovalRow, planCaseRemoval } from "./case-remove-core";

const MODULE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MODULE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function row(id: string, moduleId: string, sortOrder: number): CaseRemovalRow {
	return { id, moduleId, name: `用例 ${id}`, sortOrder };
}

const LOGIN = row("1", MODULE_A, 0);
const LOGOUT = row("2", MODULE_A, 1);
const REFUND = row("3", MODULE_A, 2);
const SEARCH = row("4", MODULE_B, 0);

const ids = (rows: readonly { id: string }[]) => rows.map((item) => item.id);

describe("planCaseRemoval：批量删除时哪些用例删除、哪些跳过、哪些已经不存在", () => {
	it.each<{
		missing: string[];
		name: string;
		removed: string[];
		requested: string[];
		runCounts: Record<string, number>;
		skipped: string[];
	}>([
		{
			missing: [],
			name: "都没有被测试任务用到：都删除",
			removed: ["1", "2"],
			requested: ["1", "2"],
			runCounts: {},
			skipped: [],
		},
		{
			missing: [],
			name: "都被测试任务用到：都跳过",
			removed: [],
			requested: ["1", "2"],
			runCounts: { "1": 1, "2": 3 },
			skipped: ["1", "2"],
		},
		{
			missing: [],
			name: "部分被用到：跳过用到的，删除其余的",
			removed: ["1", "4"],
			requested: ["1", "2", "4"],
			runCounts: { "2": 2 },
			skipped: ["2"],
		},
		{
			missing: ["9"],
			name: "有的用例已经被别人删除：报告为不存在，其余照常",
			removed: ["1"],
			requested: ["1", "9"],
			runCounts: {},
			skipped: [],
		},
		{
			missing: [],
			name: "重复的 id 只处理一次",
			removed: ["1"],
			requested: ["1", "1"],
			runCounts: {},
			skipped: [],
		},
	])("$name", ({ missing, removed, requested, runCounts, skipped }) => {
		const plan = planCaseRemoval(
			requested,
			[LOGIN, LOGOUT, REFUND, SEARCH].filter((item) =>
				requested.includes(item.id)
			),
			new Map(Object.entries(runCounts))
		);
		expect(ids(plan.removable).sort()).toEqual(removed);
		expect(ids(plan.skipped.map((item) => item.testCase))).toEqual(skipped);
		expect(plan.missingIds).toEqual(missing);
	});

	it("跳过的用例带被几个测试任务用到", () => {
		const plan = planCaseRemoval(["2"], [LOGOUT], new Map([["2", 3]]));
		expect(plan.skipped).toEqual([
			{ referencedByRunCount: 3, testCase: LOGOUT },
		]);
	});

	it("同一模块中按排序从后往前删除：前面的用例补位时，后面要删的用例的位置不变", () => {
		const plan = planCaseRemoval(
			["1", "3", "4", "2"],
			[LOGIN, LOGOUT, REFUND, SEARCH],
			new Map()
		);
		const inModuleA = plan.removable.filter(
			(item) => item.moduleId === MODULE_A
		);
		expect(ids(inModuleA)).toEqual(["3", "2", "1"]);
	});
});
