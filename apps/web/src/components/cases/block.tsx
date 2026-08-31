/**
 * 用例正文的块级节点渲染（段落 / 标题 / 代码 / 列表 / 引用）。
 *
 * 从 markdown-render.tsx 拆出来。ListBlocks、ListNode 与 Block 三者互相递归
 * （Block → ListNode → ListBlocks → Block，引用块还有 Block → ListBlocks），
 * 拆成多个文件必然绕出循环 import，所以它们留在同一个文件里；
 * markdown-render.tsx 只保留最外层的入口。
 *
 * 与整条预览链路一样**不许 import 任何 `@codemirror/*`**：
 * `/projects/$projectId` 会 SSR，而 `@codemirror/view` 在 import 期就读 `navigator`。
 */
import type { ReactElement } from "react";

import { Heading } from "@/components/cases/heading";
import type {
	MarkdownBlock,
	MarkdownListItem,
} from "@/components/cases/markdown-doc";
import {
	InlineNodes,
	type MarkdownImageUrls,
} from "@/components/cases/markdown-inline-render";
import { TEXT_FLOW_CLASS } from "@/components/cases/markdown-text-flow";

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
export function Block({
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
