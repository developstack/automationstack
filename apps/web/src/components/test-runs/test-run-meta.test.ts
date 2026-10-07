import { describe, expect, it } from "vitest";

import {
	commentFieldText,
	needsVerdictDetails,
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
	it("按结论给准确的词，不再两头兼顾", () => {
		expect(commentFieldText("failed").label).toBe("失败原因");
		expect(commentFieldText("blocked").label).toBe("阻塞原因");
	});

	it("两种结论的 placeholder 不同：复现路径对阻塞并不贴切", () => {
		const failed = commentFieldText("failed").placeholder;
		const blocked = commentFieldText("blocked").placeholder;
		expect(failed).not.toBe(blocked);
		expect(blocked).not.toContain("复现");
	});

	it("其余结论下就两个字：说明，不再在括号里补一遍来历", () => {
		for (const result of ["passed", "skipped", "untested"] as const) {
			const text = commentFieldText(result);
			expect(text.label).toBe("说明");
			expect(text.placeholder).toBeUndefined();
		}
	});
});
