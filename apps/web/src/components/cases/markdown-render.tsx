import { type ReactElement, useMemo } from "react";

import { Block } from "@/components/cases/block";
import type { MarkdownTextSize } from "@/components/cases/heading";
import { parseMarkdownDoc } from "@/components/cases/markdown-doc";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";

const ROOT_CLASSES: Record<MarkdownTextSize, string> = {
	sm: "space-y-2 text-sm leading-relaxed",
	xs: "space-y-2 text-xs leading-relaxed",
};

export interface MarkdownRenderProps {
	imageUrls?: MarkdownImageUrls;
	text: string;
	textSize?: MarkdownTextSize;
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
				<Block
					block={block}
					imageUrls={imageUrls}
					key={block.from}
					textSize={textSize}
				/>
			))}
		</div>
	);
}
