/**
 * 块级层：markdown 原文 → 结构化中间表示（**纯函数**，可直接单测）。
 *
 * 之所以把「解析」与「渲染成 React」切成两个文件，不是为了行数：
 * 这一段的正确性标准是「一个字符都不能被吃掉」，而那件事只有对着数据结构
 * 才断言得干净（`markdown-doc.test.ts`）。渲染侧一旦掺进来，测试就得拖上
 * jsdom，而根级 vitest 的 web project 是 node 环境（见 vitest.config.ts 的注释）。
 *
 * 不丢字符的具体做法、以及行内节点的降级规则，写在 `markdown-inline.ts` 的文件头。
 */
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
	/** 源码偏移量。渲染时当 React key 用——见 `block.tsx` 的说明。 */
	from: number;
}

export type MarkdownBlock =
	| { blocks: MarkdownBlock[]; from: number; kind: "quote" }
	| { children: MarkdownInline[]; from: number; kind: "heading"; level: number }
	| { children: MarkdownInline[]; from: number; kind: "paragraph" }
	| { from: number; items: MarkdownListItem[]; kind: "list"; ordered: boolean }
	| { from: number; kind: "code"; text: string };

/**
 * 只支持到 4 级标题。
 *
 * 用例正文是一段说明，不是一篇文档：真出现 `##### `，把它当纯文本原样显示，
 * 比给它一个比正文还小的字号有用。5/6 级会落进 `toBlock` 的 default 分支降级。
 */
const HEADING_LEVELS: Record<string, number> = {
	ATXHeading1: 1,
	ATXHeading2: 2,
	ATXHeading3: 3,
	ATXHeading4: 4,
};

/** 块级语法标记：`>` 与 `- ` / `1. `，由渲染出来的引用块与列表样式顶替。 */
const BLOCK_MARK_NAMES = new Set(["ListMark", "QuoteMark"]);

function rawParagraph(from: number, text: string): MarkdownBlock {
	return {
		children: [{ from, kind: "text", text }],
		from,
		kind: "paragraph",
	};
}

/** 围栏/缩进代码块的正文：只取 CodeText，围栏本身与语言标注不进渲染结果。 */
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
			// HeaderMark 被行内层丢掉后会留下 `# ` 那个空格，trim 掉它。
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
			// 表格、HTML 块、分隔线、5/6 级标题……一律降级成它覆盖的原文纯文本。
			// 少一层样式可以接受，少几个字符不行。
			return rawParagraph(node.from, source.slice(node.from, node.to));
	}
}

/**
 * 子节点之间的空隙在块级只可能是空行与缩进，直接跳过；
 * 万一出现了非空白（语法树有洞），仍按原文补一段纯文本，绝不静默吞掉。
 */
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

/**
 * 正文原文 → 块序列。`text` 为空串或全是换行时返回空数组（不抛）。
 *
 * ⚠️ 这个函数**只读**：返回值里的每一段字符串都是 `text` 的切片，
 * 没有任何转义、规范化或重新序列化。正文本身永远不会因为渲染而改变。
 */
export function parseMarkdownDoc(text: string): MarkdownBlock[] {
	if (text === "") {
		return [];
	}
	return collectBlocks(markdownParser.parse(text).topNode, text);
}
