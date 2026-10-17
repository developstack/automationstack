import { describe, expect, it } from "vitest";

import { resetWarning } from "@/components/test-runs/run-reset-impact";

describe("resetWarning", () => {
	it.each([
		["什么都不会丢时返回 null：这一下不该弹框", null],
		["全空白的说明等同于没有说明", "   \n "],
	])("%s", (_name, comment) => {
		expect(resetWarning({ comment, stepResultCount: 0 })).toBeNull();
	});

	it("有说明就拦一下，且正文点名丢的是说明", () => {
		const warning = resetWarning({
			comment: "支付超时，订单状态没回滚",
			stepResultCount: 0,
		});
		expect(warning).toContain("说明");
		expect(warning).not.toContain("分步判定");
	});

	it("有分步判定就拦一下，且说明要恢复只能重判一遍", () => {
		const warning = resetWarning({ comment: null, stepResultCount: 3 });
		expect(warning).toContain("分步判定和实际结果");
		expect(warning).toContain("重新判");
	});

	it("两样都有时一句话里两样都点名", () => {
		const warning = resetWarning({
			comment: "第 3 步炸了",
			stepResultCount: 3,
		});
		expect(warning).toContain("说明");
		expect(warning).toContain("分步判定");
	});
});
