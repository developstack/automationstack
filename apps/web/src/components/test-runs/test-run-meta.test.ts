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
		// 用户的原话：判「通过」时下面还挂着说明、附件、缺陷三块，页面很杂。
		// 附件与缺陷后来改成了「有内容才显示」，说明这一档仍由本函数把关。
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
		// 这一档只出现在逃生口路径上（comment 已有内容却改判成了别的结论）。
		// 说成「失败原因」会让人以为系统在要一条「通过」的用例交代失败原因，
		// 所以不能沿用上面两档的词；但也不该写成「说明（上次判失败 / 阻塞时留下
		// 的）」——那半句来历，用例名旁的结论徽章与「最后由 X 于 Y 判定为 Z」
		// 已经在同一屏上说过两遍了。
		for (const result of ["passed", "skipped", "untested"] as const) {
			const text = commentFieldText(result);
			expect(text.label).toBe("说明");
			// 这一档框里必有内容，placeholder 看不见，不该编一句出来。
			expect(text.placeholder).toBeUndefined();
		}
	});
});
