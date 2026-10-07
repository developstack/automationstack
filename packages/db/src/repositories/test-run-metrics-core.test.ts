import { describe, expect, it } from "vitest";

import {
	computeCompletionRate,
	computePassRate,
} from "./test-run-metrics-core";

describe("computeCompletionRate", () => {
	it("四种结论都算「测过了」", () => {
		expect(computeCompletionRate({ total: 10, untested: 2 })).toBe(0.8);
	});

	it("空测试任务返回 null 而不是 0", () => {
		expect(computeCompletionRate({ total: 0, untested: 0 })).toBeNull();
	});
});

describe("computePassRate", () => {
	it("通过率 = 通过 / (通过 + 失败)", () => {
		expect(computePassRate({ failed: 1, passed: 3 })).toBe(0.75);
	});

	it("阻塞与跳过不进分母：同样的 3 通过 1 失败，加多少阻塞跳过都不变", () => {
		const counts = { blocked: 5, failed: 1, passed: 3, skipped: 4 };
		expect(computePassRate(counts)).toBe(0.75);
	});

	it("分母为 0 返回 null 而不是 0——此刻我们对质量一无所知", () => {
		const counts = { blocked: 3, failed: 0, passed: 0, skipped: 2 };
		expect(computePassRate(counts)).toBeNull();
	});
});
