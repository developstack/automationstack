/**
 * 行内层：lezer 语法树 → 结构化中间表示（**纯函数，不碰 React、不碰 DOM**）。
 *
 * ## 一条不可让步的约束：不丢字符
 *
 * 用例正文里存量的全是纯文本，里面有 `user_id`、`3 * 4`、`?a=1&b=2` 这类字符
 * （理由见 `markdown-extensions.ts` 的文件头：编辑缓冲区里存的就是原文，
 * 任何 remark 式往返都会把它们转义成 `user\_id`，污染存量数据并让
 * `versions/field-diff.ts` 的逐词 diff 冒出一堆假改动）。
 *
 * 渲染器遵守同一条约束的**只读版本**：解析只用来决定「这一段该套什么标签」，
 * 一个字符都不改写、不回写。具体做法是遍历时**用偏移量对账**——
 * 相邻两个子节点之间的空隙一律按原文切片取回来当纯文本，
 * 不认识的节点整段降级成它覆盖的原文。这样「认不出来」的最坏结果是少一层样式，
 * 而不是少几个字符。
 */
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

/**
 * 语法标记节点：它们是**格式本身**，不是内容，因此在行内层被整段丢弃。
 *
 * 与编辑器那边刻意相反——编辑器把 `**` 调暗但保持可见（所见即所存），
 * 预览这一侧的职责恰恰是「把格式变成样式」，留着标记就没有预览可言了。
 * 丢标记不违反上面那条「不丢字符」：被丢的是 `**`、`` ` ``、`[`、`#`，
 * 而它们在渲染结果里由粗体/等宽/下划线/字号顶替，用户看得见它们的作用。
 */
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

/** 两个 CodeMark 之间的那一段；没有标记时退回整段原文。 */
function innerBetweenMarks(node: MarkdownSyntaxNode, source: string): string {
	const first = node.firstChild;
	const last = node.lastChild;
	if (first === null || last === null || first === last) {
		return source.slice(node.from, node.to);
	}
	return source.slice(first.to, last.from);
}

/**
 * 图片：**只认两个 scheme**——已登记的 `![](attachment:<uuid>)`，
 * 与本次会话正在上传的 `![](uploading:<token>)`。
 *
 * `attachment:` 的判定直接调 `isCaseAttachmentRef`
 * （`@automationstack/api/lib/case-attachment-ref` 是这个格式的唯一真相），
 * 而不是在这里再写一份正则——两份定义的结局是改一处漏一处，历史正文里的图
 * 静默变成一串裸文本。`uploading:` 同理，唯一真相在 `case-upload-placeholder.ts`。
 *
 * 两者产出同一种图片节点，只用 `pending` 区分：渲染侧对它们的查表方式完全一样
 * （`imageUrls` 里 `attachment:` 查签名 URL、`uploading:` 查本地 blob URL），
 * 差别只在「查不到时该说什么」——「加载中」还是「上传中」。
 *
 * 任何其它 src（用户手打的 `https://…` 外链）**不产出图片节点**，降级成纯文本：
 * 预览里向外部主机发一个 GET，等于把「有人正在编辑这条用例」这件事连同时间、
 * IP、Referer 一起送给那台主机，一个 1×1 的图就是一枚追踪像素。
 * 正文里的图只能来自我们自己签名的附件。
 */
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
		// token 走的是同一个 `attachmentId` 字段：它就是这张图在 `imageUrls` 里的
		// 查表键，上传成功后整段引用会被换成 `attachment:<id>`，键也跟着换。
		return {
			attachmentId: token,
			from: node.from,
			kind: "image",
			pending: true,
		};
	}
	return textNode(node.from, raw);
}

/**
 * 链接：只有 http/https 才成为链接节点。
 *
 * 复用 `test-runs/report-meta.ts` 的 `isSafeHttpUrl` 而不是另写一个：那里已经
 * 处理了 `jAvAsCrIpT:` 大小写、`new URL()` 抛异常两种情况，而它整个文件只有
 * `import type`，运行时不拖任何依赖，跨目录 import 的代价为零。
 * 判定不安全时降级成纯文本而不是丢掉——那是有人写进正文的内容。
 */
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
		// 引用式链接 `[a][b]`、或结构残缺——都没有可用的 href。
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
			// 硬换行（HardBreak，原文是「两个空格 + \n」）也走这里：把它当原文纯文本
			// 带出去，配合渲染侧的 whitespace-pre-wrap 就是一次换行，且一个字符不少。
			// 其它没认出来的行内节点同样降级成原文——见文件头那条约束。
			return textNode(node.from, source.slice(node.from, node.to));
	}
}

/**
 * 把 `node` 在 `[from, to)` 这段范围内的内容拆成行内节点序列。
 *
 * 关键在 `cursor` 这个游标：每处理完一个子节点就把它推到子节点的末尾，
 * 子节点之间**剩下的空隙一律按原文切回来**。段落里的 `3 * 4`、`user_id`
 * 压根不会产生任何子节点，它们整段都是空隙——这就是它们能原样活下来的原因。
 */
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

/** 去掉行内序列首尾的空白（标题的 `# ` 之后那个空格由它抹掉）。 */
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
