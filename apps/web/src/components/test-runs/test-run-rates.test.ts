import { describe, expect, it } from "vitest";

import { RATE_UNKNOWN } from "@/components/test-runs/rate-format";
import {
	formatPassRate,
	testRunProgress,
} from "@/components/test-runs/test-run-rates";

interface CountsInput {
	blocked?: number;
	failed?: number;
	passed?: number;
	skipped?: number;
	total: number;
	untested?: number;
}

function counts(input: CountsInput) {
	return {
		blocked: input.blocked ?? 0,
		failed: input.failed ?? 0,
		passed: input.passed ?? 0,
		skipped: input.skipped ?? 0,
		total: input.total,
		untested: input.untested ?? 0,
	};
}

describe("formatPassRate", () => {
	it("把阻塞与跳过踢出分母", () => {
		expect(
			formatPassRate(counts({ blocked: 6, failed: 1, passed: 3, total: 10 }))
		).toBe("75%");
	});

	it("分母为 0 时显示占位而不是 0%", () => {
		expect(
			formatPassRate(counts({ blocked: 4, skipped: 2, total: 10, untested: 4 }))
		).toBe(RATE_UNKNOWN);
	});

	it("空测试任务同样显示占位", () => {
		expect(formatPassRate(counts({ total: 0 }))).toBe(RATE_UNKNOWN);
	});

	it("全部通过是 100%", () => {
		expect(formatPassRate(counts({ passed: 8, total: 8 }))).toBe("100%");
	});

	it("差一条没过时不许显示 100%", () => {
		expect(formatPassRate(counts({ failed: 1, passed: 119, total: 120 }))).toBe(
			"99%"
		);
	});
});

describe("testRunProgress", () => {
	it("阻塞与跳过也算「有结论」", () => {
		const progress = testRunProgress(
			counts({ blocked: 1, passed: 30, skipped: 3, total: 120, untested: 86 })
		);
		expect(progress.done).toBe(34);
		expect(progress.total).toBe(120);
	});

	it("空测试任务的比例是 0 而不是 NaN", () => {
		expect(testRunProgress(counts({ total: 0 })).ratio).toBe(0);
	});
});
