import type { JSX } from "react";
import type { ExtraProps } from "react-markdown";

import {
	collectHastText,
	type DocHastElement,
} from "@/components/docs/doc-hast";

const WARNING_MARKERS = ["⚠️", "⚠"];

const NOTE_CLASS =
	"flex flex-col gap-2 rounded-lg border-border border-l-2 bg-muted p-3";
const WARNING_CLASS =
	"flex flex-col gap-2 rounded-lg border-destructive/50 border-l-2 bg-destructive/10 p-3";

function isWarning(node: DocHastElement | undefined): boolean {
	if (node === undefined) {
		return false;
	}
	const text = collectHastText(node.children).trimStart();
	return WARNING_MARKERS.some((marker) => text.startsWith(marker));
}

export function DocCallout({
	children,
	node,
}: JSX.IntrinsicElements["blockquote"] & ExtraProps) {
	return (
		<blockquote className={isWarning(node) ? WARNING_CLASS : NOTE_CLASS}>
			{children}
		</blockquote>
	);
}
