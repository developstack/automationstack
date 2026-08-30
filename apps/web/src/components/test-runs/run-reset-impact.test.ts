import { describe, expect, it } from "vitest";

import { resetWarning } from "@/components/test-runs/run-reset-impact";

describe("resetWarning", () => {
	it("什么都不会丢时返回 null：这一下不该弹框", () => {
		// 判过「通过」、没写说明、没有分步记录——回退与再点一次「通过」等价可逆，
		// 为它收一次二次确认的过路费，只会教会用户闭眼点确认。
		expect(resetWarning({ comment: null, stepResultCount: 0 })).toBeNull();
	});

	it("全空白的说明等同于没有说明", () => {
		// 后端把 trim 后为空的说明存成 null（见 `useCommentDraft.handleBlur`），
		// 但实时推过来的旧值仍可能是一串空格，判据不能被它骗到。
		expect(resetWarning({ comment: "   \n ", stepResultCount: 0 })).toBeNull();
	});

	it("有说明就拦一下，且正文点名丢的是说明", () => {
		const warning = resetWarning({
			comment: "支付超时，订单状态没回滚",
			stepResultCount: 0,
		});
		expect(warning).not.toBeNull();
		expect(warning).toContain("说明");
		// 只丢说明的那一档不该提分步判定，否则用户会以为自己刚清掉了一屏判定。
		expect(warning).not.toContain("分步判定");
	});

	it("有分步判定就拦一下，且说明要恢复只能重判一遍", () => {
		const warning = resetWarning({ comment: null, stepResultCount: 3 });
		expect(warning).toContain("分步判定");
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
