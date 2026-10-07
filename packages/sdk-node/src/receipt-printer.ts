import type { IngestExecutionReceipt } from "./contract-types.js";
import type { AttachmentOutcome } from "./reporter-types.js";

export type ReceiptSink = (line: string) => void;

interface LabeledEntry {
	label: string;
	reason: string;
}

const CJK_PATTERN =
	/[\u1100-\u115F\u2E80-\u4DBF\u4E00-\u9FFF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

function displayWidth(text: string): number {
	let width = 0;
	for (const char of text) {
		width += CJK_PATTERN.test(char) ? 2 : 1;
	}
	return width;
}

function padToWidth(text: string, target: number): string {
	return text + " ".repeat(Math.max(0, target - displayWidth(text)));
}

function groupByReason(entries: LabeledEntry[], category: string): string[] {
	const grouped = new Map<string, string[]>();
	for (const entry of entries) {
		const bucket = grouped.get(entry.reason);
		if (bucket) {
			bucket.push(entry.label);
		} else {
			grouped.set(entry.reason, [entry.label]);
		}
	}
	return [...grouped.entries()].map(
		([reason, labels]) =>
			`${category} ${labels.length} 条（${reason}）：${labels.join("、")}`
	);
}

function formatWrittenTo(receipt: IngestExecutionReceipt): string[] {
	const names = receipt.writtenTo.map((entry) => `《${entry.runName}》`);
	const widest = Math.max(0, ...names.map(displayWidth));
	return receipt.writtenTo.map(
		(entry, index) =>
			`写入 ${padToWidth(names[index] ?? "", widest)}  ${entry.updated} 条`
	);
}

export function formatReceiptLines(receipt: IngestExecutionReceipt): string[] {
	const lines = [
		`[automationstack] 上报对账单（execution ${receipt.executionId}）`,
	];
	if (receipt.writtenTo.length === 0) {
		lines.push("写入 0 个测试任务");
	} else {
		lines.push(...formatWrittenTo(receipt));
	}
	lines.push(
		...groupByReason(
			receipt.skippedManual.map((entry) => ({
				label: `${entry.sourceRef} @《${entry.runName}》`,
				reason: entry.reason,
			})),
			"跳过"
		),
		...groupByReason(
			receipt.unmatchedCases.map((entry) => ({
				label: entry.sourceRef,
				reason: entry.reason,
			})),
			"未匹配"
		),
		...groupByReason(
			receipt.outOfScope.map((entry) => ({
				label: entry.runName
					? `${entry.sourceRef} @《${entry.runName}》`
					: entry.sourceRef,
				reason: entry.reason,
			})),
			"越界"
		)
	);
	return lines;
}

export function formatAttachmentLines(outcome: AttachmentOutcome): string[] {
	if (outcome.uploaded === 0 && outcome.rejections.length === 0) {
		return [];
	}
	const lines = outcome.storageConfigured
		? [`附件 已登记 ${outcome.registered} 个（上传 ${outcome.uploaded} 个）`]
		: ["附件 存储未配置，本轮附件全部跳过；结论已正常写入"];
	lines.push(...outcome.rejections.map((reason) => `附件 被拒：${reason}`));
	return lines;
}

const defaultSink: ReceiptSink = (line) => {
	// biome-ignore lint/suspicious/noConsole: 对账单就是要打到终端，这里是本包唯一的输出层。
	console.log(line);
};

export function printReceipt(
	receipt: IngestExecutionReceipt,
	attachments: AttachmentOutcome | null,
	sink: ReceiptSink = defaultSink
): void {
	for (const line of formatReceiptLines(receipt)) {
		sink(line);
	}
	if (attachments) {
		for (const line of formatAttachmentLines(attachments)) {
			sink(line);
		}
	}
}
