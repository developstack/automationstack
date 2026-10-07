import {
	hasNoWrites,
	type IngestExecutionReceipt,
	mergeReceipts,
} from "@automationstack/sdk";
import { expect, test } from "vitest";

interface ReceiptDraft {
	executionId: string;
	unmatched?: string[];
	writtenTo?: [string, string, number][];
}

function receipt(draft: ReceiptDraft): IngestExecutionReceipt {
	return {
		executionId: draft.executionId,
		outOfScope: [],
		skippedManual: [],
		unmatchedCases: (draft.unmatched ?? []).map((sourceRef) => ({
			reason: "用例不存在",
			sourceRef,
		})),
		writtenTo: (draft.writtenTo ?? []).map(([runId, runName, updated]) => ({
			runId,
			runName,
			updated,
		})),
	};
}

test("[AUTO-LOGIN-001] 分批回来的对账单合并后，同一个任务只占一行且条数是加总", () => {
	const merged = mergeReceipts([
		receipt({
			executionId: "e-1",
			unmatched: ["AUTO-GONE-900"],
			writtenTo: [
				["run-a", "冒烟回归", 120],
				["run-b", "支付专项", 8],
			],
		}),
		receipt({
			executionId: "e-2",
			unmatched: ["AUTO-GONE-900"],
			writtenTo: [["run-a", "冒烟回归", 34]],
		}),
	]);

	expect(merged.writtenTo).toEqual([
		{ runId: "run-a", runName: "冒烟回归", updated: 154 },
		{ runId: "run-b", runName: "支付专项", updated: 8 },
	]);
	expect(merged.unmatchedCases).toHaveLength(2);
	expect(hasNoWrites(merged)).toBe(false);
});

test("[AUTO-PAY-003] 同一个幂等键重发拿回的是第一次那份对账单", {
	skip: true,
}, () => {
	expect(mergeReceipts([receipt({ executionId: "e-1" })])).toBeDefined();
});
