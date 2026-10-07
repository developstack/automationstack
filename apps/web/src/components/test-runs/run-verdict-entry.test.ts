import { describe, expect, it } from "vitest";

import { canPickCaseVerdict } from "@/components/test-runs/run-verdict-entry";

describe("canPickCaseVerdict", () => {
	it("改态 + 非分步：给按钮，也给 P / F / B / S", () => {
		expect(canPickCaseVerdict({ editing: true, hasSteps: false })).toBe(true);
	});

	it("只读态一律不给——这条就是快捷键那个 bug 的回归断言", () => {
		expect(canPickCaseVerdict({ editing: false, hasSteps: false })).toBe(false);
	});

	it("分步形态下两态都不给：用例级入口会把逐步判定铺平", () => {
		expect(canPickCaseVerdict({ editing: true, hasSteps: true })).toBe(false);
		expect(canPickCaseVerdict({ editing: false, hasSteps: true })).toBe(false);
	});
});
