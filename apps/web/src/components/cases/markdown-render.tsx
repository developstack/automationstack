/**
 * 用例正文（markdown 原文）→ React 节点。实时预览与只读展示共用同一个组件。
 *
 * ## 只读，且只读
 *
 * 这里**不产生也不回写任何文本**：解析结果里的每段字符串都是原文的切片
 * （见 `markdown-doc.ts`）。正文里的 `user_id`、`3 * 4`、`?a=1&b=2` 因此
 * 一个字符都不会变——`versions/field-diff.ts` 对原始字符串逐词 diff，
 * 任何 remark 式的「解析再序列化」往返都会把它们转义成 `user\_id`，
 * 于是版本对比页会凭空多出一堆没人改过的「改动」。
 *
 * ## 为什么不引排版插件
 *
 * `apps/web` 没装 `@tailwindcss/typography`，这里也不装：`prose` 那套的字号、
 * 行高、颜色是为长文档调的，而这段内容要么挤在分栏预览里、要么挤在详情抽屉里，
 * 周围全是 `text-sm`。手写十来个类比覆盖一整套 prose 变量便宜得多。
 *
 * ## SSR
 *
 * `/projects/$projectId` 会 SSR，因此本文件及其依赖**不许 import 任何
 * `@codemirror/*`**（`@codemirror/view` 在 import 期就读 `navigator`）。
 * 语法树来自 `markdown-parser.ts` 里那个与编辑器共用的裸 lezer parser。
 */
import { type ReactElement, useMemo } from "react";

import {
	type MarkdownBlock,
	type MarkdownListItem,
	parseMarkdownDoc,
} from "@/components/cases/markdown-doc";
import {
	InlineNodes,
	type MarkdownImageUrls,
} from "@/components/cases/markdown-inline-render";

export interface MarkdownRenderProps {
	/** attachment id → 15 分钟签名 URL；缺失表示还没查到或已失效。 */
	imageUrls?: MarkdownImageUrls;
	text: string;
}

/**
 * 标题字号只拉开到 4 级，且都比 prose 保守：这段内容住在 `text-sm` 的上下文里，
 * 一个 `text-2xl` 的 h1 会把整块内容的重心从正文挪到标题上。
 */
const HEADING_CLASS: Record<number, string> = {
	1: "mt-2 font-semibold text-base",
	2: "mt-2 font-semibold text-sm",
	3: "mt-2 font-semibold text-sm",
	4: "mt-2 font-medium text-sm",
};

/**
 * `whitespace-pre-wrap` 是这一页的关键类。
 *
 * 编辑器里存的就是原文，用户按下的每一个回车都在字符串里；markdown 的标准做法
 * 是把单个换行折叠成空格，那会让「所见（编辑器里三行）」与「所得（预览里一行）」
 * 对不上。保留换行同时也让硬换行（HardBreak 的原文 `"  \n"`）不需要任何特殊处理
 * ——它作为纯文本原样带过来，在这里就是一次换行，一个字符都没丢。
 */
const TEXT_FLOW_CLASS = "whitespace-pre-wrap break-words";

function ListBlocks({
	blocks,
	imageUrls,
}: {
	blocks: readonly MarkdownBlock[];
	imageUrls: MarkdownImageUrls | undefined;
}): ReactElement {
	return (
		<>
			{blocks.map((block) => (
				<Block block={block} imageUrls={imageUrls} key={block.from} />
			))}
		</>
	);
}

function ListNode({
	imageUrls,
	items,
	ordered,
}: {
	imageUrls: MarkdownImageUrls | undefined;
	items: readonly MarkdownListItem[];
	ordered: boolean;
}): ReactElement {
	const className = ordered
		? "list-decimal space-y-1 pl-5"
		: "list-disc space-y-1 pl-5";
	const children = items.map((item) => (
		<li key={item.from}>
			<ListBlocks blocks={item.blocks} imageUrls={imageUrls} />
		</li>
	));
	return ordered ? (
		<ol className={className}>{children}</ol>
	) : (
		<ul className={className}>{children}</ul>
	);
}

/**
 * key 一律用源码偏移量 `from`，不用数组下标：在正文开头插入一个字符会让所有
 * 下标整体错位，React 就会把第 2 段的 DOM 复用给第 1 段，正在加载的图片会闪一下。
 */
function Block({
	block,
	imageUrls,
}: {
	block: MarkdownBlock;
	imageUrls: MarkdownImageUrls | undefined;
}): ReactElement {
	switch (block.kind) {
		case "paragraph":
			return (
				<p className={TEXT_FLOW_CLASS}>
					<InlineNodes imageUrls={imageUrls} nodes={block.children} />
				</p>
			);
		case "heading":
			return (
				<Heading level={block.level}>
					<InlineNodes imageUrls={imageUrls} nodes={block.children} />
				</Heading>
			);
		case "code":
			return (
				<pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
					<code>{block.text}</code>
				</pre>
			);
		case "list":
			return (
				<ListNode
					imageUrls={imageUrls}
					items={block.items}
					ordered={block.ordered}
				/>
			);
		default:
			return (
				<blockquote className="border-muted-foreground/40 border-l-2 pl-3 text-muted-foreground">
					<ListBlocks blocks={block.blocks} imageUrls={imageUrls} />
				</blockquote>
			);
	}
}

function Heading({
	children,
	level,
}: {
	children: ReactElement;
	level: number;
}): ReactElement {
	const className = `${HEADING_CLASS[level] ?? HEADING_CLASS[4]} ${TEXT_FLOW_CLASS}`;
	if (level === 1) {
		return <h1 className={className}>{children}</h1>;
	}
	if (level === 2) {
		return <h2 className={className}>{children}</h2>;
	}
	if (level === 3) {
		return <h3 className={className}>{children}</h3>;
	}
	return <h4 className={className}>{children}</h4>;
}

export function MarkdownRender({
	imageUrls,
	text,
}: MarkdownRenderProps): ReactElement {
	// 解析随每次按键发生（预览是实时的），按原文缓存一层，输入没变就不重解析。
	const blocks = useMemo(() => parseMarkdownDoc(text), [text]);
	return (
		<div className="space-y-2 text-sm leading-relaxed">
			{blocks.map((block) => (
				<Block block={block} imageUrls={imageUrls} key={block.from} />
			))}
		</div>
	);
}
