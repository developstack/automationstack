import {
	collectInline,
	type MarkdownInline,
	trimInlineEdges,
} from "@/components/cases/markdown-inline";
import {
	type MarkdownSyntaxNode,
	markdownParser,
} from "@/components/cases/markdown-parser";

export interface MarkdownListItem {
	blocks: MarkdownBlock[];
	from: number;
}

export type MarkdownBlock =
	| { blocks: MarkdownBlock[]; from: number; kind: "quote" }
	| { children: MarkdownInline[]; from: number; kind: "heading"; level: number }
	| { children: MarkdownInline[]; from: number; kind: "paragraph" }
	| { from: number; items: MarkdownListItem[]; kind: "list"; ordered: boolean }
	| { from: number; kind: "code"; text: string };

const HEADING_LEVELS: Record<string, number> = {
	ATXHeading1: 1,
	ATXHeading2: 2,
	ATXHeading3: 3,
	ATXHeading4: 4,
};

const BLOCK_MARK_NAMES = new Set(["ListMark", "QuoteMark"]);

function rawParagraph(from: number, text: string): MarkdownBlock {
	return {
		children: [{ from, kind: "text", text }],
		from,
		kind: "paragraph",
	};
}

function codeText(node: MarkdownSyntaxNode, source: string): string {
	const parts: string[] = [];
	for (let child = node.firstChild; child !== null; child = child.nextSibling) {
		if (child.name === "CodeText") {
			parts.push(source.slice(child.from, child.to));
		}
	}
	return parts.join("\n");
}

function listBlock(
	node: MarkdownSyntaxNode,
	source: string,
	ordered: boolean
): MarkdownBlock {
	const items: MarkdownListItem[] = [];
	for (let child = node.firstChild; child !== null; child = child.nextSibling) {
		if (child.name === "ListItem") {
			items.push({ blocks: collectBlocks(child, source), from: child.from });
		}
	}
	return { from: node.from, items, kind: "list", ordered };
}

function toBlock(
	node: MarkdownSyntaxNode,
	source: string
): MarkdownBlock | null {
	if (BLOCK_MARK_NAMES.has(node.name)) {
		return null;
	}
	const level = HEADING_LEVELS[node.name];
	if (level !== undefined) {
		return {
			children: trimInlineEdges(
				collectInline(node, source, node.from, node.to)
			),
			from: node.from,
			kind: "heading",
			level,
		};
	}
	switch (node.name) {
		case "Paragraph":
			return {
				children: collectInline(node, source, node.from, node.to),
				from: node.from,
				kind: "paragraph",
			};
		case "FencedCode":
		case "CodeBlock":
			return { from: node.from, kind: "code", text: codeText(node, source) };
		case "BulletList":
			return listBlock(node, source, false);
		case "OrderedList":
			return listBlock(node, source, true);
		case "Blockquote":
			return {
				blocks: collectBlocks(node, source),
				from: node.from,
				kind: "quote",
			};
		default:
			return rawParagraph(node.from, source.slice(node.from, node.to));
	}
}

function pushGap(
	out: MarkdownBlock[],
	source: string,
	from: number,
	to: number
) {
	const gap = source.slice(from, to);
	if (gap.trim() !== "") {
		out.push(rawParagraph(from, gap));
	}
}

function collectBlocks(
	node: MarkdownSyntaxNode,
	source: string
): MarkdownBlock[] {
	const out: MarkdownBlock[] = [];
	let cursor = node.from;
	for (let child = node.firstChild; child !== null; child = child.nextSibling) {
		pushGap(out, source, cursor, child.from);
		const block = toBlock(child, source);
		if (block !== null) {
			out.push(block);
		}
		cursor = child.to;
	}
	pushGap(out, source, cursor, node.to);
	return out;
}

export function parseMarkdownDoc(text: string): MarkdownBlock[] {
	if (text === "") {
		return [];
	}
	return collectBlocks(markdownParser.parse(text).topNode, text);
}
