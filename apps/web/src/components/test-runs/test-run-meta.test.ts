import { describe, expect, it } from "vitest";

import {
	commentFieldText,
	needsVerdictDetails,
} from "@/components/test-runs/test-run-meta";

describe("needsVerdictDetails", () => {
	it("只有失败与阻塞需要说明 / 附件 / 缺陷", () => {
		expect(needsVerdictDetails("failed")).toBe(true);
		expect(needsVerdictDetails("blocked")).toBe(true);
	});

	it("通过 / 跳过 / 未测下三块都不相关", () => {
		// 用户的原话：判「通过」时下面还挂着说明、附件、缺陷三块，页面很杂。
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

	it("其余结论下说明只可能是上一次留下的，label 要讲清来历", () => {
		// 这一档只出现在逃生口路径上（comment 已有内容却改判成了别的结论），
		// 说成「失败原因」会让人以为系统在要一条「通过」的用例交代失败原因。
		for (const result of ["passed", "skipped", "untested"] as const) {
			const text = commentFieldText(result);
			expect(text.label).toContain("上次");
			// 这一档框里必有内容，placeholder 看不见，不该编一句出来。
			expect(text.placeholder).toBeUndefined();
		}
	});
});
