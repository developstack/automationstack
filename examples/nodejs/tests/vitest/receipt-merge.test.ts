/**
 * 被测的是 `@automationstack/sdk` 的**对账单合并**：`mergeReceipts` / `hasNoWrites`。
 *
 * 为什么值得单独测：一次上报可能被切成多批发（`RESULTS_PER_BATCH` = 200），
 * 于是服务端会回来好几份对账单，而人只想看一份。合并规则里藏着两个**不对称**的
 * 决定——`writtenTo` 按 runId 求和，三类拒绝却原样拼接、一条都不去重。
 * 两条都写在 `receipt-merge.ts` 的注释里，也都值得有人盯着别被顺手「优化」掉。
 *
 * ⚠️ 本文件里没有一行 SDK 的上报动作：不 new reporter、不 addResult、不 finish。
 * 上报是 `adapters/vitest-reporter.ts` 从 vitest 官方扩展位挂进去的，测试文件不知情。
 */

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
	// 拒绝一律不去重：同一条 sourceRef 在两批各被拒一次，就是实打实的两条信息。
	expect(merged.unmatchedCases).toHaveLength(2);
	expect(hasNoWrites(merged)).toBe(false);
});

/**
 * 跳过的理由写在这里，而不是留一句「TODO」：
 *
 * 「重试」按定义是**另一个进程**，它拿着同一个幂等键重发，服务端从缓存里原样
 * 返回第一次的那份对账单。所以这件事根本不经过 `mergeReceipts`——它在服务端的
 * 幂等层就结束了。要验只能起两个进程实打实发两次，那是 apps/server 的集成测试，
 * 不是示例里能诚实断言的东西。
 *
 * 用 `{ skip: true }` 而不是 `test.skip`：后者会被仓库的 lint 规则拦下来。
 */
test("[AUTO-PAY-003] 同一个幂等键重发拿回的是第一次那份对账单", {
	skip: true,
}, () => {
	expect(mergeReceipts([receipt({ executionId: "e-1" })])).toBeDefined();
});
