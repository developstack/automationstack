import { describe, expect, it } from "vitest";

import {
	DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
} from "./project-settings-core";

describe("自动提交天数常量", () => {
	it("默认值落在合法区间内（否则列默认值本身就违反 CHECK）", () => {
		expect(DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS).toBeGreaterThanOrEqual(
			MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS
		);
		expect(DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS).toBeLessThanOrEqual(
			MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS
		);
	});

	it("下界至少是 1：0 天等于「一完成就锁死」，那是另一个语义", () => {
		expect(MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS).toBeGreaterThanOrEqual(1);
	});

	it("区间非空", () => {
		expect(MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS).toBeGreaterThan(
			MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS
		);
	});

	it("三个值都是整数（列是 integer，小数会被静默截断）", () => {
		for (const value of [
			DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
			MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
			MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
		]) {
			expect(Number.isInteger(value)).toBe(true);
		}
	});
});
