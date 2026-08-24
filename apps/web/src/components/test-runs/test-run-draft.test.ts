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
	it("空表单与空基线相同", () => {
		expect(isTestRunDraftDirty(draft(), draft())).toBe(false);
	});

	it("填了名称就是脏的", () => {
		expect(isTestRunDraftDirty(draft({ name: "v2.4.0 回归" }), draft())).toBe(
			true
		);
	});

	it("只敲了空格也算改动", () => {
		expect(isTestRunDraftDirty(draft({ description: "  " }), draft())).toBe(
			true
		);
	});

	it("勾了用例就是脏的", () => {
		expect(isTestRunDraftDirty(draft({ caseIds: ["c1"] }), draft())).toBe(true);
	});

	it("勾选顺序不同但集合相同，不算改动", () => {
		const baseline = draft({ caseIds: ["c1", "c2"] });
		expect(
			isTestRunDraftDirty(draft({ caseIds: ["c2", "c1"] }), baseline)
		).toBe(false);
	});

	it("预填的名称原样保留时不算改动", () => {
		const baseline = draft({ name: "冒烟 重测" });
		expect(isTestRunDraftDirty(draft({ name: "冒烟 重测" }), baseline)).toBe(
			false
		);
		expect(isTestRunDraftDirty(draft({ name: "冒烟 重测2" }), baseline)).toBe(
			true
		);
	});
});
