import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { describe, expect, it } from "vitest";

import { diffScreenshots } from "@/components/versions/screenshot-diff";
import { diffCaseSteps } from "@/components/versions/step-diff";

const kinds = (entries: readonly { id: string; kind: string }[]) =>
	entries.map((entry) => `${entry.id}:${entry.kind}`);

describe("diffScreenshots：一组截图在两个版本之间的变化", () => {
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
		expect(kinds(diffScreenshots(oldIds, newIds))).toEqual(expected);
	});
});

const step = (shots: Partial<CaseStep> = {}): CaseStep => ({
	expected: "展示登录表单",
	id: "s1",
	step: "打开登录页",
	...shots,
});

describe("diffCaseSteps：两组截图各自对比，截图的变化也是步骤的变化", () => {
	it.each([
		[
			"没有截图等于空列表",
			[step()],
			[step({ actionScreenshots: [] })],
			"unchanged",
			[],
			[],
		],
		[
			"只有操作截图变化",
			[step({ actionScreenshots: ["a"], expectedScreenshots: ["x"] })],
			[step({ actionScreenshots: ["a", "b"], expectedScreenshots: ["x"] })],
			"modified",
			["a:unchanged", "b:added"],
			["x:unchanged"],
		],
		[
			"只有预期截图变化",
			[step({ expectedScreenshots: ["x", "y"] })],
			[step({ expectedScreenshots: ["y", "x"] })],
			"modified",
			[],
			["y:unchanged", "x:moved"],
		],
		[
			"两组同时变化",
			[step({ actionScreenshots: ["a"], expectedScreenshots: ["x"] })],
			[step({ actionScreenshots: [], expectedScreenshots: ["x", "y"] })],
			"modified",
			["a:removed"],
			["x:unchanged", "y:added"],
		],
		[
			"新增步骤的截图都是新增",
			[],
			[step({ actionScreenshots: ["a"], expectedScreenshots: ["x"] })],
			"added",
			["a:added"],
			["x:added"],
		],
		[
			"删除步骤的截图都是删除",
			[step({ actionScreenshots: ["a"], expectedScreenshots: ["x"] })],
			[],
			"removed",
			["a:removed"],
			["x:removed"],
		],
	] as const)("%s", (...[, prev, next, kind, action, expected]) => {
		const diff = diffCaseSteps(prev, next);
		const [entry] = diff.entries;
		expect(entry?.kind).toBe(kind);
		expect(kinds(entry?.screenshots.actionScreenshots ?? [])).toEqual(action);
		expect(kinds(entry?.screenshots.expectedScreenshots ?? [])).toEqual(
			expected
		);
		expect(diff.hasChanges).toBe(kind !== "unchanged");
	});
});
