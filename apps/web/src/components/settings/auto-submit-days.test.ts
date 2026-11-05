import { describe, expect, it } from "vitest";

import {
	isAutoSubmitDaysDirty,
	MAX_AUTO_SUBMIT_DAYS,
	MIN_AUTO_SUBMIT_DAYS,
	validateAutoSubmitDays,
} from "@/components/settings/auto-submit-days";

describe("isAutoSubmitDaysDirty：有没有未保存的修改", () => {
	it.each([
		["输入等于已保存的天数时没有修改", "7", false],
		["写法不同但天数相同时没有修改", " 07 ", false],
		["天数不同时有修改", "8", true],
		["清空时有修改", "", true],
		["输入无效的值时有修改", "abc", true],
	])("%s", (_name, input, dirty) => {
		expect(isAutoSubmitDaysDirty(input, 7)).toBe(dirty);
	});
});

describe("validateAutoSubmitDays", () => {
	it.each([
		["接受区间下端", String(MIN_AUTO_SUBMIT_DAYS), MIN_AUTO_SUBMIT_DAYS],
		["接受区间上端", String(MAX_AUTO_SUBMIT_DAYS), MAX_AUTO_SUBMIT_DAYS],
		["容忍首尾空格（粘贴常带）", " 7 ", 7],
	])("%s", (_name, input, days) => {
		expect(validateAutoSubmitDays(input)).toEqual({ days, kind: "ok" });
	});

	it.each(["0", "31", "", "3.5", "三", "-3", "+3", "3e0"])(
		"拒绝越界的天数、非整数与空值：%j",
		(input) => {
			expect(validateAutoSubmitDays(input).kind).toBe("invalid");
		}
	);
});
