import type {
	IngestExecutionReceipt,
	IngestWrittenToEntry,
} from "./contract-types";

/**
 * 多批的对账单合成一份给人看。
 *
 * 分批是 SDK 的实现细节，人关心的是「这一轮结果扩散到了哪些任务」（D34）。
 * 按批打印会让同一个任务出现三行、每行一个数字，人得自己做加法——
 * 而这正是 §7.2 第 3 条要避免的：`writtenTo` 是唯一的披露点，它必须一眼能读。
 *
 * ⚠️ **只有 `writtenTo` 按 runId 合并求和，三类拒绝一律原样拼接、不去重**。
 * 去重会把「同一条 sourceRef 在两个任务各被拒一次」压成一条，那是在丢信息；
 * 「逐条列出、绝不静默丢弃」是沿用 `InvalidRunCases` 的既定语义。
 */
export function mergeReceipts(
	receipts: IngestExecutionReceipt[]
): IngestExecutionReceipt {
	const writtenTo = new Map<string, IngestWrittenToEntry>();
	const merged: IngestExecutionReceipt = {
		// 多批时 executionId 有多个，取第一批的：它是人回平台查执行记录的入口，
		// 而同一个 run key 派生出的这几行在报告里本来就是相邻的。
		executionId: receipts[0]?.executionId ?? "",
		outOfScope: [],
		skippedManual: [],
		unmatchedCases: [],
		writtenTo: [],
	};
	for (const receipt of receipts) {
		merged.outOfScope.push(...receipt.outOfScope);
		merged.skippedManual.push(...receipt.skippedManual);
		merged.unmatchedCases.push(...receipt.unmatchedCases);
		for (const entry of receipt.writtenTo) {
			const existing = writtenTo.get(entry.runId);
			writtenTo.set(entry.runId, {
				runId: entry.runId,
				runName: entry.runName,
				updated: (existing?.updated ?? 0) + entry.updated,
			});
		}
	}
	merged.writtenTo = [...writtenTo.values()];
	return merged;
}

/**
 * `writtenTo` 为空 = 一条都没写进去。**这是 SDK 唯一据以报错的信号**（§7.2 第 4 条），
 * 不看 HTTP 状态码：服务端在这种情况下返回的仍然是 200 加一份说明详尽的对账单
 * （§5.8——状态码表达「请求本身有没有问题」，对账单表达「业务上发生了什么」）。
 */
export function hasNoWrites(receipt: IngestExecutionReceipt): boolean {
	return receipt.writtenTo.length === 0;
}
