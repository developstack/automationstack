import { Fragment, type ReactElement } from "react";

import { ImageNode } from "@/components/cases/image-node";
import type { MarkdownInline } from "@/components/cases/markdown-inline";

export type MarkdownImageUrls = ReadonlyMap<string, string | null>;

interface InlineNodesProps {
	imageUrls: MarkdownImageUrls | undefined;
	nodes: readonly MarkdownInline[];
}

function renderInline(
	node: MarkdownInline,
	imageUrls: MarkdownImageUrls | undefined
): ReactElement | string {
	switch (node.kind) {
		case "text":
			return node.text;
		case "code":
			return (
				<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
					{node.text}
				</code>
			);
		case "emphasis":
			return (
				<em>
					<InlineNodes imageUrls={imageUrls} nodes={node.children} />
				</em>
			);
		case "strong":
			return (
				<strong className="font-semibold">
					<InlineNodes imageUrls={imageUrls} nodes={node.children} />
				</strong>
			);
		case "image":
			return (
				<ImageNode
					attachmentId={node.attachmentId}
					imageUrls={imageUrls}
					pending={node.pending}
				/>
			);
		default:
			return (
				<a
					className="text-primary underline underline-offset-2"
					href={node.url}
					rel="noopener"
					target="_blank"
				>
					<InlineNodes imageUrls={imageUrls} nodes={node.children} />
				</a>
			);
	}
}

export function InlineNodes({
	imageUrls,
	nodes,
}: InlineNodesProps): ReactElement {
	return (
		<>
			{nodes.map((node) => (
				<Fragment key={node.from}>{renderInline(node, imageUrls)}</Fragment>
			))}
		</>
	);
}
