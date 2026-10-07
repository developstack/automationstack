import type { CaseStep } from "@automationstack/db/schema/test-cases";

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

const MAX_SUMMARY_LENGTH = 255;

const ELLIPSIS = "…";

const SECTION_HEADING_LEVEL = 3;

const NEWLINE_PATTERN = /\r?\n/;
const WHITESPACE_RUN_PATTERN = /\s+/g;

function textNodes(value: string): AdfNode[] {
	const lines = value.split(NEWLINE_PATTERN);
	const nodes: AdfNode[] = [];
	for (const line of lines) {
		if (nodes.length > 0) {
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
	attachmentCount: number;
	caseName: string;
	comment: string | null;
	preconditions: string | null;
	runName: string;
	runUrl: string;
	steps: readonly CaseStep[];
}

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
