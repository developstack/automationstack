import { parser } from "@lezer/markdown";

export const markdownParser = parser;

export type MarkdownTree = ReturnType<typeof markdownParser.parse>;
export type MarkdownSyntaxNode = MarkdownTree["topNode"];
