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
