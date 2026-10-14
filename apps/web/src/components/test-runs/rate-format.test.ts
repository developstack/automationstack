import { describe, expect, it } from "vitest";

import {
	formatRate,
	formatShare,
	RATE_UNKNOWN,
} from "@/components/test-runs/rate-format";

describe("formatRate", () => {
	it.each([
		["把 null 显示成破折号而不是 0%", null, RATE_UNKNOWN],
		["真的是 0 时显示 0%", 0, "0%"],
		["未满 100% 不会被四舍五入成 100%", 119 / 120, "99%"],
		["未满 100% 不会被四舍五入成 100%", 0.999, "99%"],
		["真的满分才显示 100%", 1, "100%"],
		["有一点点通过时不会被抹成 0%", 1 / 400, "1%"],
		["中间值照常四舍五入", 0.5, "50%"],
		["中间值照常四舍五入", 0.876, "88%"],
	])("%s：%s 显示成 %s", (_name, rate, text) => {
		expect(formatRate(rate)).toBe(text);
	});
});

describe("formatShare", () => {
	it("total 为 0 时是 0% 而不是 NaN%", () => {
		expect(formatShare(0, 0)).toBe("0%");
	});

	it("占比同样不会被进位成 100%", () => {
		expect(formatShare(119, 120)).toBe("99%");
	});
});
