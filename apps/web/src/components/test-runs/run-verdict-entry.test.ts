import { describe, expect, it } from "vitest";

import { canPickCaseVerdict } from "@/components/test-runs/run-verdict-entry";

describe("canPickCaseVerdict", () => {
	it.each([
		["改态 + 非分步：给按钮，也给 P / F / B / S", true, false, true],
		["只读态一律不给——这条就是快捷键那个 bug 的回归断言", false, false, false],
		["分步形态下改态也不给：用例级入口会把逐步判定铺平", true, true, false],
		["分步形态下只读态也不给", false, true, false],
	])("%s", (_name, editing, hasSteps, allowed) => {
		expect(canPickCaseVerdict({ editing, hasSteps })).toBe(allowed);
	});
});
