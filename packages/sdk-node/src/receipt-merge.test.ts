import { describe, expect, it } from "vitest";

import type { IngestExecutionReceipt } from "./contract-types";
import { hasNoWrites, mergeReceipts } from "./receipt-merge";

const emptyReceipt = (
	overrides: Partial<IngestExecutionReceipt>
): IngestExecutionReceipt => ({
	executionId: "exec-1",
	outOfScope: [],
	skippedManual: [],
	unmatchedCases: [],
	writtenTo: [],
	...overrides,
});

describe("多批对账单合并（D34）", () => {
	it("同一个任务跨批的条数相加，人不用自己做加法", () => {
		const merged = mergeReceipts([
			emptyReceipt({
				writtenTo: [{ runId: "run-a", runName: "v2.3 回归", updated: 78 }],
			}),
			emptyReceipt({
				executionId: "exec-2",
				writtenTo: [{ runId: "run-a", runName: "v2.3 回归", updated: 22 }],
			}),
		]);
		expect(merged.writtenTo).toEqual([
			{ runId: "run-a", runName: "v2.3 回归", updated: 100 },
		]);
	});

	it("一次上报写进两个任务就有两行（D33 / D34）", () => {
		const merged = mergeReceipts([
			emptyReceipt({
				writtenTo: [
					{ runId: "run-a", runName: "v2.3 回归", updated: 78 },
					{ runId: "run-b", runName: "支付模块专项", updated: 12 },
				],
			}),
		]);
		expect(merged.writtenTo).toHaveLength(2);
	});

	it("三类拒绝原样拼接、不去重——去重就是在丢信息", () => {
		const entry = {
			caseId: "case-1",
			reason: "不在任何未提交任务的范围内",
			runName: null,
			sourceRef: "PAY-CART-031",
		};
		const merged = mergeReceipts([
			emptyReceipt({ outOfScope: [entry] }),
			emptyReceipt({ outOfScope: [entry] }),
		]);
		expect(merged.outOfScope).toHaveLength(2);
	});

	it("writtenTo 为空就是「一条都没写进去」，与 HTTP 状态码无关", () => {
		expect(hasNoWrites(emptyReceipt({}))).toBe(true);
		expect(
			hasNoWrites(
				emptyReceipt({
					writtenTo: [{ runId: "run-a", runName: "x", updated: 0 }],
				})
			)
		).toBe(false);
	});
});
