import {
	extractCaseAttachmentIds,
	isCaseAttachmentRef,
} from "@automationstack/api/lib/case-attachment-ref";
import { extractCaseUploadingToken } from "@/components/cases/case-upload-placeholder";
import type { MarkdownSyntaxNode } from "@/components/cases/markdown-parser";
import { isSafeHttpUrl } from "@/components/test-runs/report-meta";

export type MarkdownInline =
	| { attachmentId: string; from: number; kind: "image"; pending: boolean }
	| { children: MarkdownInline[]; from: number; kind: "emphasis" }
	| { children: MarkdownInline[]; from: number; kind: "link"; url: string }
	| { children: MarkdownInline[]; from: number; kind: "strong" }
	| { from: number; kind: "code"; text: string }
	| { from: number; kind: "text"; text: string };

const MARK_NODE_NAMES = new Set([
	"CodeMark",
	"EmphasisMark",
	"HeaderMark",
	"LinkMark",
	"ListMark",
	"QuoteMark",
]);

function textNode(from: number, text: string): MarkdownInline {
	return { from, kind: "text", text };
}

function innerBetweenMarks(node: MarkdownSyntaxNode, source: string): string {
	const first = node.firstChild;
	const last = node.lastChild;
	if (first === null || last === null || first === last) {
		return source.slice(node.from, node.to);
	}
	return source.slice(first.to, last.from);
}

function imageInline(node: MarkdownSyntaxNode, source: string): MarkdownInline {
	const raw = source.slice(node.from, node.to);
	const attachmentId = isCaseAttachmentRef(raw)
		? extractCaseAttachmentIds(raw)[0]
		: undefined;
	if (attachmentId !== undefined) {
		return { attachmentId, from: node.from, kind: "image", pending: false };
	}
	const token = extractCaseUploadingToken(raw);
	if (token !== undefined) {
		return {
			attachmentId: token,
			from: node.from,
			kind: "image",
			pending: true,
		};
	}
	return textNode(node.from, raw);
}

function linkInline(node: MarkdownSyntaxNode, source: string): MarkdownInline {
	const raw = source.slice(node.from, node.to);
	const marks: MarkdownSyntaxNode[] = [];
	let url: MarkdownSyntaxNode | null = null;
	for (let child = node.firstChild; child !== null; child = child.nextSibling) {
		if (child.name === "LinkMark") {
			marks.push(child);
		} else if (child.name === "URL") {
			url = child;
		}
	}
	const [open, close] = marks;
	if (url === null || open === undefined || close === undefined) {
		return textNode(node.from, raw);
	}
	const href = source.slice(url.from, url.to);
	if (!isSafeHttpUrl(href)) {
		return textNode(node.from, raw);
	}
	return {
		children: collectInline(node, source, open.to, close.from),
		from: node.from,
		kind: "link",
		url: href,
	};
}

function toInline(
	node: MarkdownSyntaxNode,
	source: string
): MarkdownInline | null {
	if (MARK_NODE_NAMES.has(node.name)) {
		return null;
	}
	const children = () => collectInline(node, source, node.from, node.to);
	switch (node.name) {
		case "Emphasis":
			return { children: children(), from: node.from, kind: "emphasis" };
		case "StrongEmphasis":
			return { children: children(), from: node.from, kind: "strong" };
		case "InlineCode":
			return {
				from: node.from,
				kind: "code",
				text: innerBetweenMarks(node, source),
			};
		case "Image":
			return imageInline(node, source);
		case "Link":
			return linkInline(node, source);
		default:
			return textNode(node.from, source.slice(node.from, node.to));
	}
}

export function collectInline(
	node: MarkdownSyntaxNode,
	source: string,
	from: number,
	to: number
): MarkdownInline[] {
	const out: MarkdownInline[] = [];
	let cursor = from;
	for (let child = node.firstChild; child !== null; child = child.nextSibling) {
		if (child.from >= to) {
			break;
		}
		if (child.to <= from) {
			continue;
		}
		if (child.from > cursor) {
			out.push(textNode(cursor, source.slice(cursor, child.from)));
		}
		const inline = toInline(child, source);
		if (inline !== null) {
			out.push(inline);
		}
		cursor = child.to;
	}
	if (cursor < to) {
		out.push(textNode(cursor, source.slice(cursor, to)));
	}
	return out;
}

export function trimInlineEdges(nodes: MarkdownInline[]): MarkdownInline[] {
	const trimmed = [...nodes];
	const [first] = trimmed;
	if (first?.kind === "text") {
		trimmed[0] = { ...first, text: first.text.trimStart() };
	}
	const lastIndex = trimmed.length - 1;
	const last = trimmed[lastIndex];
	if (last?.kind === "text") {
		trimmed[lastIndex] = { ...last, text: last.text.trimEnd() };
	}
	return trimmed.filter((item) => item.kind !== "text" || item.text !== "");
}
