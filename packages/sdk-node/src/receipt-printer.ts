import type { IngestExecutionReceipt } from "./contract-types.js";
import type { AttachmentOutcome } from "./reporter-types.js";

/**
 * 对账单的渲染（§7.2 第 3 条）。**本包唯一往终端写东西的地方。**
 *
 * 集中在一处是有意的：散落各处的 `console.log` 会让「哪些信息一定会被打出来」
 * 变成一件要通读全包才能回答的事，而对账单是用户**唯一**的反馈渠道。
 * 渲染是纯函数（`formatReceiptLines`），输出只有 `printReceipt` 一处——
 * 测试断言的是前者，后者只负责把字符串交给 sink。
 *
 * 三类拒绝**按服务端给的 `reason` 原文分组**，一条不漏地列出 sourceRef。
 * 分组而不是逐行重复类别标题，是因为同一类里的理由通常只有两三种；
 * 但**理由本身一个字都不改写**——§7.2 第 4 条要的就是原样透传，
 * SDK 自己概括一句「上报失败」会把「用例不存在」和「任务还在待评审」抹平成同一件事。
 */

export type ReceiptSink = (line: string) => void;

interface LabeledEntry {
	label: string;
	reason: string;
}

const CJK_PATTERN =
	/[\u1100-\u115F\u2E80-\u4DBF\u4E00-\u9FFF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/** 中文按两格宽算，否则任务名一长一短时 `writtenTo` 那几行的数字对不齐。 */
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

/**
 * ⚠️ `writtenTo` 为空时**也要打**一行说明。
 * 什么都不打会让「一条都没写」和「日志被截断了」看起来一模一样。
 */
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

/**
 * 附件那一轮单独打。它**不参与退出码判定**：R2 没配置、配额用完都只是降级，
 * 结论那一轮早就写进去了，让附件拖垮整次上报是 §5.6 明确否掉的（同第二期 D9）。
 */
export function formatAttachmentLines(outcome: AttachmentOutcome): string[] {
	if (outcome.uploaded === 0 && outcome.rejections.length === 0) {
		return [];
	}
	const lines = outcome.storageConfigured
		? [`附件 已登记 ${outcome.registered} 个（上传 ${outcome.uploaded} 个）`]
		: ["附件 存储未配置，本轮附件全部跳过；结论已正常写入"];
	// 逐条打，不聚合成「N 个失败」：附件被拒的理由各不相同（配额、待评审、
	// 用例不存在），聚合之后人不知道该去解决哪一个。
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
