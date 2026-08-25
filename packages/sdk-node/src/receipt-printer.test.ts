import { describe, expect, it } from "vitest";

import type { IngestExecutionReceipt } from "./contract-types";
import { formatAttachmentLines, formatReceiptLines } from "./receipt-printer";

const receipt: IngestExecutionReceipt = {
	executionId: "exec-1",
	outOfScope: [
		{
			caseId: "case-31",
			reason: "不在任何未提交任务的范围内",
			runName: null,
			sourceRef: "PAY-CART-031",
		},
	],
	skippedManual: [
		{
			reason: "已有人工结论",
			runName: "v2.3 回归",
			sourceRef: "PAY-CART-007",
		},
	],
	unmatchedCases: [
		{ reason: "项目里没有这个 sourceRef 的用例", sourceRef: "PAY-NEW-099" },
	],
	writtenTo: [
		{ runId: "run-a", runName: "v2.3 回归", updated: 78 },
		{ runId: "run-b", runName: "支付模块专项", updated: 12 },
	],
};

describe("对账单打印（§7.2 第 3 条）", () => {
	it("writtenTo 按任务逐行打——写进三个任务日志里就得有三行", () => {
		const lines = formatReceiptLines(receipt);
		expect(lines.filter((line) => line.startsWith("写入 "))).toHaveLength(2);
		expect(lines.some((line) => line.includes("《v2.3 回归》"))).toBe(true);
		expect(lines.some((line) => line.includes("《支付模块专项》"))).toBe(true);
		expect(lines.some((line) => line.includes("78 条"))).toBe(true);
		expect(lines.some((line) => line.includes("12 条"))).toBe(true);
	});

	it("跳过 / 未匹配 / 越界三类逐条打，理由是服务端原文", () => {
		const lines = formatReceiptLines(receipt);
		expect(lines).toContain(
			"跳过 1 条（已有人工结论）：PAY-CART-007 @《v2.3 回归》"
		);
		expect(lines).toContain(
			"未匹配 1 条（项目里没有这个 sourceRef 的用例）：PAY-NEW-099"
		);
		expect(lines).toContain(
			"越界 1 条（不在任何未提交任务的范围内）：PAY-CART-031"
		);
	});

	it("一条都不吞：三类里每一条 sourceRef 都出现在输出里", () => {
		const text = formatReceiptLines(receipt).join("\n");
		for (const sourceRef of ["PAY-CART-007", "PAY-NEW-099", "PAY-CART-031"]) {
			expect(text).toContain(sourceRef);
		}
	});

	it("越界条目带任务名时也指名道姓，否则对账单读起来自相矛盾", () => {
		const lines = formatReceiptLines({
			...receipt,
			outOfScope: [
				{
					caseId: "case-1",
					reason: "任务还在待评审",
					runName: "支付模块专项",
					sourceRef: "PAY-CART-031",
				},
			],
		});
		expect(lines).toContain(
			"越界 1 条（任务还在待评审）：PAY-CART-031 @《支付模块专项》"
		);
	});

	it("writtenTo 为空时也要打一行，否则和日志被截断长得一样", () => {
		const lines = formatReceiptLines({ ...receipt, writtenTo: [] });
		expect(lines).toContain("写入 0 个测试任务");
	});

	it("附件降级单独打，且拒绝理由逐条列出", () => {
		expect(
			formatAttachmentLines({
				registered: 0,
				rejections: ["A：存储未配置"],
				storageConfigured: false,
				uploaded: 0,
			})
		).toEqual([
			"附件 存储未配置，本轮附件全部跳过；结论已正常写入",
			"附件 被拒：A：存储未配置",
		]);
	});
});
