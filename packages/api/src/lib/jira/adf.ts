import type { CaseStep } from "@automationstack/db/schema/test-cases";

/**
 * Atlassian Document Format（ADF）组装。
 *
 * **Jira Cloud REST v3 的 `description` 是 ADF JSON，不是字符串。**
 * 把 Markdown 或纯文本直接塞进去，Jira 会以 400 拒绝整个建单请求
 * （v2 接口才收纯文本，但 v2 在 Cloud 上已是遗留接口）。所以正文必须
 * 在这里组装成节点树，并且这一步是纯函数——建单路径上唯一容易写错、
 * 又完全不需要网络就能验证的部分，全部落在单测里。
 */

export interface AdfMark {
	attrs?: Record<string, string>;
	type: string;
}

export interface AdfNode {
	attrs?: Record<string, unknown>;
	content?: AdfNode[];
	marks?: AdfMark[];
	text?: string;
	type: string;
}

export interface AdfDocument {
	content: AdfNode[];
	type: "doc";
	version: 1;
}

/** Jira 的 summary 上限；超长会被整条请求拒掉，这里先截断。 */
const MAX_SUMMARY_LENGTH = 255;

/** 截断时留给省略号的位置。 */
const ELLIPSIS = "…";

/** 正文里的小标题统一用 h3：issue 详情页里 h1/h2 会盖过 Jira 自己的字段标题。 */
const SECTION_HEADING_LEVEL = 3;

const NEWLINE_PATTERN = /\r?\n/;
const WHITESPACE_RUN_PATTERN = /\s+/g;

/**
 * ADF 的 text 节点**不允许空字符串**（schema 校验会拒），所以任何可能为空的
 * 文本都要先过这里。返回空数组时调用方应整段跳过，而不是产出一个空 text 节点。
 */
function textNodes(value: string): AdfNode[] {
	const lines = value.split(NEWLINE_PATTERN);
	const nodes: AdfNode[] = [];
	for (const line of lines) {
		if (nodes.length > 0) {
			// 段内换行在 ADF 里是独立的 hardBreak 节点，不能靠 text 里的 \n——
			// 后者会被渲染成一个空格，多行的实际结果会挤成一坨。
			nodes.push({ type: "hardBreak" });
		}
		if (line !== "") {
			nodes.push({ text: line, type: "text" });
		}
	}
	return nodes;
}

function paragraph(value: string): AdfNode | null {
	const content = textNodes(value);
	return content.length === 0 ? null : { content, type: "paragraph" };
}

function heading(value: string): AdfNode {
	return {
		attrs: { level: SECTION_HEADING_LEVEL },
		content: [{ text: value, type: "text" }],
		type: "heading",
	};
}

function linkParagraph(label: string, href: string): AdfNode {
	return {
		content: [
			{
				marks: [{ attrs: { href }, type: "link" }],
				text: label,
				type: "text",
			},
		],
		type: "paragraph",
	};
}

function stepListItem(step: CaseStep, index: number): AdfNode {
	const expected = step.expected.trim();
	const lines =
		expected === ""
			? `${index + 1}. ${step.step}`
			: `${index + 1}. ${step.step}\n预期：${expected}`;
	return {
		content: [paragraph(lines) ?? { content: [], type: "paragraph" }],
		type: "listItem",
	};
}

/**
 * 步骤用 orderedList 而不是把序号写进纯文本：Jira 里换行会被重排，
 * 有序列表才能保证「第 3 步」在任何宽度下都还是第 3 步。
 * `step.expected` 逐条跟在动作后面——「哪一步的预期没达成」是看 bug 的人
 * 第一眼要找的东西，集中放到末尾就得两头对照。
 */
function stepsSection(steps: readonly CaseStep[]): AdfNode[] {
	const items = steps
		.filter((step) => step.step.trim() !== "")
		.map((step, index) => stepListItem(step, index));
	if (items.length === 0) {
		return [];
	}
	return [heading("复现步骤"), { content: items, type: "orderedList" }];
}

function optionalSection(title: string, value: string | null): AdfNode[] {
	const trimmed = value?.trim() ?? "";
	if (trimmed === "") {
		return [];
	}
	const body = paragraph(trimmed);
	return body === null ? [] : [heading(title), body];
}

export interface DefectDescriptionInput {
	/**
	 * 附件张数。**刻意只写数量、不写链接**：R2 的签名 GET URL 15 分钟就过期
	 * （D10），写进 Jira 描述里的外链几分钟后必然是死链——issue 里挂着一张
	 * 打不开的图，比明说「去平台看」更误导人（plan §5.2 同此结论）。
	 */
	attachmentCount: number;
	caseName: string;
	/** 执行人填的失败 / 阻塞原因。 */
	comment: string | null;
	preconditions: string | null;
	runName: string;
	/** 平台上这个测试任务的地址，issue 里的回链。 */
	runUrl: string;
	steps: readonly CaseStep[];
}

/**
 * issue 标题：`[测试任务名] 用例名`。
 *
 * 带上任务名是因为同一条用例会在多轮测试里反复失败，Jira 列表里只看用例名
 * 分不出「这是哪一轮的」。summary 必须是单行——Jira 会把换行原样吞掉，
 * 列表里显示成一坨。
 */
export function buildDefectSummary(input: {
	caseName: string;
	runName: string;
}): string {
	const flat = `[${input.runName}] ${input.caseName}`
		.replace(WHITESPACE_RUN_PATTERN, " ")
		.trim();
	if (flat.length <= MAX_SUMMARY_LENGTH) {
		return flat;
	}
	return flat.slice(0, MAX_SUMMARY_LENGTH - ELLIPSIS.length) + ELLIPSIS;
}

/** 组装缺陷正文：来源回链 → 前置条件 → 复现步骤 → 实际结果 → 附件说明。 */
export function buildDefectDescription(
	input: DefectDescriptionInput
): AdfDocument {
	const content: AdfNode[] = [
		linkParagraph(`来源：测试任务「${input.runName}」`, input.runUrl),
		...optionalSection("前置条件", input.preconditions),
		...stepsSection(input.steps),
		...optionalSection("实际结果", input.comment),
	];
	if (input.attachmentCount > 0) {
		const note = paragraph(
			`本条用例在平台上有 ${input.attachmentCount} 个附件（截图 / 录屏 / 日志），请点击上方回链查看。`
		);
		if (note !== null) {
			content.push(heading("附件"), note);
		}
	}
	return { content, type: "doc", version: 1 };
}
