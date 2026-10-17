import { describe, expect, it } from "vitest";

import {
	commentFieldText,
	needsVerdictDetails,
	runPermissions,
} from "@/components/test-runs/test-run-meta";

describe("needsVerdictDetails", () => {
	it("只有失败与阻塞需要主动给出说明框", () => {
		expect(needsVerdictDetails("failed")).toBe(true);
		expect(needsVerdictDetails("blocked")).toBe(true);
	});

	it("通过 / 跳过 / 未测下不主动给说明框", () => {
		expect(needsVerdictDetails("passed")).toBe(false);
		expect(needsVerdictDetails("skipped")).toBe(false);
		expect(needsVerdictDetails("untested")).toBe(false);
	});
});

describe("commentFieldText", () => {
	it.each([
		["failed", true],
		["blocked", true],
		["passed", false],
		["skipped", false],
		["untested", false],
	] as const)(
		"%s 的标签是说明（不再叫失败原因或阻塞原因），有 placeholder：%s",
		(result, hasPlaceholder) => {
			const text = commentFieldText(result);
			expect(text.label).toBe("说明");
			expect(text.placeholder !== undefined).toBe(hasPlaceholder);
		}
	);

	it("两种结论的 placeholder 不同：复现路径对阻塞并不贴切", () => {
		const failed = commentFieldText("failed").placeholder;
		const blocked = commentFieldText("blocked").placeholder;
		expect(failed).not.toBe(blocked);
		expect(blocked).not.toContain("复现");
	});
});

describe("runPermissions", () => {
	it.each([
		[
			"pending_review",
			{ canConclude: false, canEditCases: true, locked: false },
		],
		["in_progress", { canConclude: true, canEditCases: true, locked: false }],
		["submitted", { canConclude: false, canEditCases: false, locked: true }],
		["voided", { canConclude: false, canEditCases: false, locked: true }],
	] as const)("%s", (status, expected) => {
		expect(runPermissions(status)).toEqual(expected);
	});
});
