import {
	formatReceiptLines,
	hasNoWrites,
	type IngestExecutionReceipt,
} from "@automationstack/sdk";
import { expect, test } from "vitest";

const EMPTY: IngestExecutionReceipt = {
	executionId: "3f9a0c11-7b2d-4e58-8a01-6c5d4e3b2a19",
	outOfScope: [],
	skippedManual: [],
	unmatchedCases: [],
	writtenTo: [],
};

test("[AUTO-REPORT-004] 被拒的用例按服务端给的理由原文分组，一条都不吞", () => {
	const lines = formatReceiptLines({
		...EMPTY,
		skippedManual: [
			{ reason: "已有人工结论", runName: "冒烟回归", sourceRef: "AUTO-A-001" },
			{ reason: "已有人工结论", runName: "冒烟回归", sourceRef: "AUTO-B-002" },
			{ reason: "任务待评审", runName: "支付专项", sourceRef: "AUTO-C-003" },
		],
		unmatchedCases: [{ reason: "用例不存在", sourceRef: "AUTO-D-004" }],
		writtenTo: [{ runId: "run-a", runName: "冒烟回归", updated: 12 }],
	});

	expect(lines).toContain(
		"跳过 2 条（已有人工结论）：AUTO-A-001 @《冒烟回归》、AUTO-B-002 @《冒烟回归》"
	);
	expect(lines).toContain("跳过 1 条（任务待评审）：AUTO-C-003 @《支付专项》");
	expect(lines).toContain("未匹配 1 条（用例不存在）：AUTO-D-004");
	expect(lines.join("\n")).not.toContain("上报失败");
});

test("[AUTO-SEARCH-005] 一条都没写进去时，对账单必须打出那一行", () => {
	const lines = formatReceiptLines(EMPTY);

	expect(lines[0]).toBe(
		`[automationstack] 上报对账单（execution ${EMPTY.executionId}）`
	);
	expect(lines).toContain("写入 0 个测试任务");
	expect(hasNoWrites(EMPTY)).toBe(true);
});
