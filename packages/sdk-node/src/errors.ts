import type { IngestExecutionReceipt } from "./contract-types.js";

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
