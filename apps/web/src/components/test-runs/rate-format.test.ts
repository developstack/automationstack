import { describe, expect, it } from "vitest";

import {
	formatRate,
	formatShare,
	RATE_UNKNOWN,
} from "@/components/test-runs/rate-format";

describe("formatRate", () => {
	it("把 null 显示成破折号而不是 0%", () => {
		// 后端在分母为 0 时返回 null（「无从判断」），0 是「判断过了，一条都没过」。
		expect(formatRate(null)).toBe(RATE_UNKNOWN);
		expect(formatRate(0)).toBe("0%");
	});

	it("未满 100% 不会被四舍五入成 100%", () => {
		// 这是最要紧的一条：119/120 显示成 100% 会让人直接下「可以上线」的结论。
		expect(formatRate(119 / 120)).toBe("99%");
		expect(formatRate(0.999)).toBe("99%");
	});

	it("真的满分才显示 100%", () => {
		expect(formatRate(1)).toBe("100%");
	});

	it("有一点点通过时不会被抹成 0%", () => {
		expect(formatRate(1 / 400)).toBe("1%");
	});

	it("中间值照常四舍五入", () => {
		expect(formatRate(0.5)).toBe("50%");
		expect(formatRate(0.876)).toBe("88%");
	});
});

describe("formatShare", () => {
	it("total 为 0 时是 0% 而不是 NaN%", () => {
		// 与 formatRate(null) 的破折号不同：这里说的是「这一档一条都没有」，
		// 是个确定的事实，不是「算不出来」。
		expect(formatShare(0, 0)).toBe("0%");
	});

	it("占比同样不会被进位成 100%", () => {
		expect(formatShare(119, 120)).toBe("99%");
	});
});
