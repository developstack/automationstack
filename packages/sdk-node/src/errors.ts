import type { IngestExecutionReceipt } from "./contract-types.js";

/**
 * `writtenTo` 为空时抛的错（§7.2 第 4 条）。
 *
 * **静默成功是最坏的情况**：QA 以为结果进去了，实际一条都没写。所以这里既抛异常
 * 又置退出码——两条通道都堵上：调用方把 `finish()` 包在 try/catch 里（reporter
 * 钩子里抛异常常常被框架吞掉）时，进程退出码仍然是非零的。
 *
 * `message` 里**原样带上服务端的每一条拒绝理由**，一个字都不概括：
 * 「一条都没写进去」的原因有好几种（用例不存在、没有未提交任务收它、任务被提交
 * 锁掉、任务还在待评审），SDK 自己编一句「上报失败」会把它们抹平成同一件事，
 * 而人要照着这句话决定是去补 sourceRef 还是去建测试任务。
 */
export class IngestEmptyWriteError extends Error {
	readonly receipt: IngestExecutionReceipt;

	constructor(receipt: IngestExecutionReceipt) {
		super(buildEmptyWriteMessage(receipt));
		this.name = "IngestEmptyWriteError";
		this.receipt = receipt;
	}
}

const NO_REASON_FALLBACK =
	"服务端没有给出任何拒绝理由（本轮 results 为空？）——这一句是 SDK 说的，不是服务端说的";

function buildEmptyWriteMessage(receipt: IngestExecutionReceipt): string {
	const reasons = [
		...receipt.unmatchedCases.map(
			(entry) => `${entry.sourceRef}：${entry.reason}`
		),
		...receipt.outOfScope.map((entry) => `${entry.sourceRef}：${entry.reason}`),
		...receipt.skippedManual.map(
			(entry) => `${entry.sourceRef} @《${entry.runName}》：${entry.reason}`
		),
	];
	const detail = reasons.length > 0 ? reasons.join("\n  ") : NO_REASON_FALLBACK;
	return `本轮结果一条都没有写进任何测试任务（writtenTo 为空）。服务端逐条给出的理由：\n  ${detail}`;
}

/** 一次 HTTP 调用没成功。`serverMessage` 是服务端 `message` 字段的原文。 */
export class IngestHttpError extends Error {
	readonly serverMessage: string | null;
	readonly status: number;

	constructor(status: number, serverMessage: string | null, url: string) {
		super(`${url} 返回 ${status}${serverMessage ? `：${serverMessage}` : ""}`);
		this.name = "IngestHttpError";
		this.serverMessage = serverMessage;
		this.status = status;
	}
}
