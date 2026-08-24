/**
 * 三个天数常量之间的约束。
 *
 * 这里能测的只有「它们互相之间是否自洽」——真正的执法者是数据库的 CHECK
 * `project_settings_auto_submit_days_range` 和 API 层的 zod，本仓库的 vitest
 * 没有 DATABASE_URL，碰不到真 SQL。但**默认值落在区间外**这件事恰恰是
 * CHECK 抓不到的：列默认值也要过 CHECK，于是错误会推迟到「某个项目第一次
 * 保存设置」时才以一条约束违反冒出来，而那时没人会想到问题出在常量上。
 */
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
