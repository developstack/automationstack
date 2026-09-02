import { describe, expect, it } from "vitest";

import { RECONNECT_MAX_DELAY_MS, reconnectDelayMs } from "./backoff";

/** 抖动抽到最小值时的曲线，用它断言「翻倍」与「封顶」这两件事。 */
const noJitter = () => 0;
/** 抖到上界（`Math.random()` 取不到 1，这里只是逼出最大值）。 */
const fullJitter = () => 1;

describe("reconnectDelayMs", () => {
	it("按次翻倍，直到撞上 30 秒上限", () => {
		const sequence = [1, 2, 3, 4, 5, 6, 7, 8].map((attempt) =>
			reconnectDelayMs(attempt, noJitter)
		);
		expect(sequence).toEqual([
			500, 1000, 2000, 4000, 8000, 15_000, 15_000, 15_000,
		]);
	});

	it("抖动只打散后一半：等待恒在 [ceiling/2, ceiling] 之间", () => {
		expect(reconnectDelayMs(1, fullJitter)).toBe(1000);
		expect(reconnectDelayMs(3, fullJitter)).toBe(4000);
		expect(reconnectDelayMs(99, fullJitter)).toBe(RECONNECT_MAX_DELAY_MS);
	});

	it("不会因为次数极大而溢出成 Infinity", () => {
		expect(reconnectDelayMs(Number.MAX_SAFE_INTEGER, noJitter)).toBe(
			RECONNECT_MAX_DELAY_MS / 2
		);
	});

	it("0 或负数按第一次算，不产生小于基准的等待", () => {
		expect(reconnectDelayMs(0, noJitter)).toBe(500);
		expect(reconnectDelayMs(-3, noJitter)).toBe(500);
	});
});
