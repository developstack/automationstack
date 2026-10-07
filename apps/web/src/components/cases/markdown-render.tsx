import { type ReactElement, useMemo } from "react";

import { Block } from "@/components/cases/block";
import { parseMarkdownDoc } from "@/components/cases/markdown-doc";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";

const ROOT_CLASSES = {
	sm: "space-y-2 text-sm leading-relaxed",
	xs: "space-y-2 text-xs leading-relaxed",
} as const;

export interface MarkdownRenderProps {
	imageUrls?: MarkdownImageUrls;
	text: string;
	textSize?: keyof typeof ROOT_CLASSES;
}

export function MarkdownRender({
	imageUrls,
	text,
	textSize = "sm",
}: MarkdownRenderProps): ReactElement {
	const blocks = useMemo(() => parseMarkdownDoc(text), [text]);
	return (
		<div className={ROOT_CLASSES[textSize]}>
			{blocks.map((block) => (
				<Block block={block} imageUrls={imageUrls} key={block.from} />
			))}
		</div>
	);
}
