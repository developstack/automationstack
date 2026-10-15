import type { ReactElement } from "react";

import { Heading, type MarkdownTextSize } from "@/components/cases/heading";
import type {
	MarkdownBlock,
	MarkdownListItem,
} from "@/components/cases/markdown-doc";
import {
	InlineNodes,
	type MarkdownImageUrls,
} from "@/components/cases/markdown-inline-render";
import { TEXT_FLOW_CLASS } from "@/components/cases/markdown-text-flow";

/** 列表标记用正文颜色并加粗：在 muted 文字（引用、预期结果）中也比正文清楚 */
const LIST_CLASS = "space-y-1 pl-5 marker:font-semibold marker:text-foreground";

function ListBlocks({
	blocks,
	imageUrls,
	textSize,
}: {
	blocks: readonly MarkdownBlock[];
	imageUrls: MarkdownImageUrls | undefined;
	textSize: MarkdownTextSize;
}): ReactElement {
	return (
		<>
			{blocks.map((block) => (
				<Block
					block={block}
					imageUrls={imageUrls}
					key={block.from}
					textSize={textSize}
				/>
			))}
		</>
	);
}

function ListNode({
	imageUrls,
	items,
	ordered,
	textSize,
}: {
	imageUrls: MarkdownImageUrls | undefined;
	items: readonly MarkdownListItem[];
	ordered: boolean;
	textSize: MarkdownTextSize;
}): ReactElement {
	const className = `${ordered ? "list-decimal" : "list-disc"} ${LIST_CLASS}`;
	const children = items.map((item) => (
		<li key={item.from}>
			<ListBlocks
				blocks={item.blocks}
				imageUrls={imageUrls}
				textSize={textSize}
			/>
		</li>
	));
	return ordered ? (
		<ol className={className}>{children}</ol>
	) : (
		<ul className={className}>{children}</ul>
	);
}

export function Block({
	block,
	imageUrls,
	textSize,
}: {
	block: MarkdownBlock;
	imageUrls: MarkdownImageUrls | undefined;
	textSize: MarkdownTextSize;
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
				<Heading level={block.level} textSize={textSize}>
					<InlineNodes imageUrls={imageUrls} nodes={block.children} />
				</Heading>
			);
		case "code":
			return (
				<pre className="overflow-x-auto rounded-md border border-border bg-muted p-2 font-mono text-xs">
					<code>{block.text}</code>
				</pre>
			);
		case "list":
			return (
				<ListNode
					imageUrls={imageUrls}
					items={block.items}
					ordered={block.ordered}
					textSize={textSize}
				/>
			);
		default:
			return (
				<blockquote className="border-muted-foreground/40 border-l-2 pl-3 text-muted-foreground">
					<ListBlocks
						blocks={block.blocks}
						imageUrls={imageUrls}
						textSize={textSize}
					/>
				</blockquote>
			);
	}
}
