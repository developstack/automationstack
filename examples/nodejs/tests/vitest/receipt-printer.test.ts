/**
 * 被测的是 `@automationstack/sdk` 的**对账单渲染**：`formatReceiptLines`。
 *
 * 它是纯函数，也是用户唯一的反馈渠道——三类拒绝要按服务端给的理由**原文**分组，
 * 一个字都不许改写；`writtenTo` 为空时也必须打出一行，否则「一条都没写进去」
 * 和「日志被截断了」在终端里长得一模一样。
 *
 * ⚠️ 本文件同样没有一行 SDK 的上报动作。
 */

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

	// 同一个理由的两条并成一行，不同理由各占一行——同一类里的理由通常只有两三种。
	expect(lines).toContain(
		"跳过 2 条（已有人工结论）：AUTO-A-001 @《冒烟回归》、AUTO-B-002 @《冒烟回归》"
	);
	expect(lines).toContain("跳过 1 条（任务待评审）：AUTO-C-003 @《支付专项》");
	expect(lines).toContain("未匹配 1 条（用例不存在）：AUTO-D-004");
	// 理由是服务端原文透传：SDK 自己概括一句「上报失败」会把「用例不存在」
	// 和「任务还在待评审」抹平成同一件事，而这两者要做的处置完全不同。
	expect(lines.join("\n")).not.toContain("上报失败");
});

test("[AUTO-SEARCH-005] 一条都没写进去时，对账单必须打出那一行", () => {
	const lines = formatReceiptLines(EMPTY);

	expect(lines[0]).toBe(
		`[automationstack] 上报对账单（execution ${EMPTY.executionId}）`
	);
	// 关键在这一行存在本身：静默是最坏的输出，它和「日志被截断」不可区分。
	expect(lines).toContain("写入 0 个测试任务");
	expect(hasNoWrites(EMPTY)).toBe(true);
});
