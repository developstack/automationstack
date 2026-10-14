import { describe, expect, it } from "vitest";

import {
	isTestRunDraftDirty,
	type TestRunDraft,
} from "@/components/test-runs/test-run-draft";

function draft(input: Partial<TestRunDraft> = {}): TestRunDraft {
	return {
		caseIds: input.caseIds ?? [],
		description: input.description ?? "",
		name: input.name ?? "",
	};
}

describe("isTestRunDraftDirty", () => {
	it.each<[string, Partial<TestRunDraft>, Partial<TestRunDraft>, boolean]>([
		["空表单与空基线相同", {}, {}, false],
		["填了名称就是脏的", { name: "v2.4.0 回归" }, {}, true],
		["只敲了空格也算改动", { description: "  " }, {}, true],
		["勾了用例就是脏的", { caseIds: ["c1"] }, {}, true],
		[
			"勾选顺序不同但集合相同，不算改动",
			{ caseIds: ["c2", "c1"] },
			{ caseIds: ["c1", "c2"] },
			false,
		],
		[
			"预填的名称原样保留时不算改动",
			{ name: "冒烟 重测" },
			{ name: "冒烟 重测" },
			false,
		],
		[
			"改了预填的名称就是脏的",
			{ name: "冒烟 重测2" },
			{ name: "冒烟 重测" },
			true,
		],
	])("%s", (_name, current, baseline, dirty) => {
		expect(isTestRunDraftDirty(draft(current), draft(baseline))).toBe(dirty);
	});
});
