import type { ExtraProps } from "react-markdown";

export type DocHastElement = NonNullable<ExtraProps["node"]>;

type DocHastContent = DocHastElement["children"][number];

const LANGUAGE_PREFIX = "language-";

export interface DocFencedCode {
	code: string;
	language: string | undefined;
}

export function collectHastText(nodes: readonly DocHastContent[]): string {
	let text = "";
	for (const node of nodes) {
		if (node.type === "text") {
			text += node.value;
		} else if (node.type === "element") {
			text += collectHastText(node.children);
		}
	}
	return text;
}

function readLanguage(value: unknown): string | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	for (const item of value) {
		if (typeof item === "string" && item.startsWith(LANGUAGE_PREFIX)) {
			return item.slice(LANGUAGE_PREFIX.length);
		}
	}
	return undefined;
}

export function readFencedCode(
	node: DocHastElement | undefined
): DocFencedCode | null {
	const child = node?.children[0];
	if (child === undefined || child.type !== "element") {
		return null;
	}
	if (child.tagName !== "code") {
		return null;
	}
	return {
		code: collectHastText(child.children),
		language: readLanguage(child.properties.className),
	};
}
