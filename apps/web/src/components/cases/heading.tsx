import type { ReactElement } from "react";

import { TEXT_FLOW_CLASS } from "@/components/cases/markdown-text-flow";

/** 正文字号档位。标题的字号随档位变化。 */
export type MarkdownTextSize = "sm" | "xs";

/**
 * 各级标题的字号和字重。H1 到 H4 的字号或字重各不相同。
 * xs 档的标题小一级，最大是 text-sm。
 */
const HEADING_CLASSES: Record<MarkdownTextSize, Record<number, string>> = {
	sm: {
		1: "mt-4 font-semibold text-lg",
		2: "mt-4 font-semibold text-base",
		3: "mt-4 font-semibold text-sm",
		4: "mt-4 font-medium text-muted-foreground text-sm",
	},
	xs: {
		1: "mt-3 font-semibold text-sm",
		2: "mt-3 font-medium text-sm",
		3: "mt-3 font-semibold text-xs",
		4: "mt-3 font-medium text-muted-foreground text-xs",
	},
};

/** 标题上方的间距大于段落之间的间距；第一个块是标题时不加间距 */
const HEADING_BASE_CLASS = `leading-snug first:mt-0 ${TEXT_FLOW_CLASS}`;

export function Heading({
	children,
	level,
	textSize,
}: {
	children: ReactElement;
	level: number;
	textSize: MarkdownTextSize;
}): ReactElement {
	const levelClasses = HEADING_CLASSES[textSize];
	const className = `${levelClasses[level] ?? levelClasses[4]} ${HEADING_BASE_CLASS}`;
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
