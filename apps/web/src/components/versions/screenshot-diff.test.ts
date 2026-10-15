import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { describe, expect, it } from "vitest";

import { diffScreenshots } from "@/components/versions/screenshot-diff";
import { diffCaseSteps } from "@/components/versions/step-diff";

describe("diffScreenshots：步骤截图在两个版本之间的变化", () => {
	it.each([
		["两边都没有截图", [], [], []],
		["截图不变", ["a", "b"], ["a", "b"], ["a:unchanged", "b:unchanged"]],
		["新增一张", ["a"], ["a", "b"], ["a:unchanged", "b:added"]],
		[
			"删除一张，其他截图不算移动",
			["a", "b", "c"],
			["b", "c"],
			["b:unchanged", "c:unchanged", "a:removed"],
		],
		[
			"交换两张，只标记一张移动",
			["a", "b"],
			["b", "a"],
			["b:unchanged", "a:moved"],
		],
		[
			"把第一张移到最后",
			["a", "b", "c"],
			["b", "c", "a"],
			["b:unchanged", "c:unchanged", "a:moved"],
		],
		[
			"同时新增、删除和移动",
			["a", "b", "c"],
			["c", "d", "a"],
			["c:unchanged", "d:added", "a:moved", "b:removed"],
		],
	])("%s", (_name, oldIds, newIds, expected) => {
		const entries = diffScreenshots(oldIds, newIds);
		expect(entries.map((entry) => `${entry.id}:${entry.kind}`)).toEqual(
			expected
		);
	});
});

const step = (screenshots?: string[]): CaseStep => ({
	expected: "展示登录表单",
	id: "s1",
	step: "打开登录页",
	...(screenshots === undefined ? {} : { screenshots }),
});

describe("diffCaseSteps：步骤截图的变化也是步骤的变化", () => {
	it.each([
		["没有截图等于空列表", [step()], [step([])], "unchanged", []],
		[
			"只有截图变化也是修改",
			[step(["a"])],
			[step(["a", "b"])],
			"modified",
			["a:unchanged", "b:added"],
		],
		["新增步骤的截图都是新增", [], [step(["a"])], "added", ["a:added"]],
		["删除步骤的截图都是删除", [step(["a"])], [], "removed", ["a:removed"]],
	] as const)("%s", (...[, prev, next, kind, shots]) => {
		const diff = diffCaseSteps(prev, next);
		const [entry] = diff.entries;
		expect(entry?.kind).toBe(kind);
		expect(entry?.screenshots.map((shot) => `${shot.id}:${shot.kind}`)).toEqual(
			shots
		);
		expect(diff.hasChanges).toBe(kind !== "unchanged");
	});
});
