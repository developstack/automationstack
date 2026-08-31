/**
 * 用例正文里的标题块（h1~h4）。从 markdown-render.tsx 拆出来，
 * 由同样拆出去的 block.tsx 调用。
 */
import type { ReactElement } from "react";

import { TEXT_FLOW_CLASS } from "@/components/cases/markdown-text-flow";

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

export function Heading({
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
