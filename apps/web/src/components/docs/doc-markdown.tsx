import { Separator } from "@automationstack/ui/components/separator";
import type { JSX } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

import { DocCallout } from "@/components/docs/doc-callout";
import { DocCodeBlock } from "@/components/docs/doc-code-block";
import { readFencedCode } from "@/components/docs/doc-hast";

const REMARK_PLUGINS = [remarkGfm];

const EXTERNAL_HREF = /^https?:\/\//i;

const STATIC_ASSET_HREF = /^\/[^?#]*\.[a-z0-9]+$/i;

const HEADING_2_CLASS = "mt-2 font-semibold text-base text-foreground";
const HEADING_3_CLASS = "mt-1 font-medium text-foreground text-sm";
const HEADING_4_CLASS = "font-medium text-foreground text-sm";
const LIST_CLASS = "flex flex-col gap-1 pl-5";
const CELL_CLASS = "border-border/60 border-b px-2 py-1.5 align-top";

function DocLink({ children, href }: JSX.IntrinsicElements["a"]) {
	const isExternal = href !== undefined && EXTERNAL_HREF.test(href);
	const isAsset = href !== undefined && STATIC_ASSET_HREF.test(href);
	return (
		<a
			className="font-medium text-foreground underline underline-offset-4"
			download={isAsset ? "" : undefined}
			href={href}
			rel={isExternal ? "noopener" : undefined}
			target={isExternal ? "_blank" : undefined}
		>
			{children}
		</a>
	);
}

function DocPre({ children, node }: JSX.IntrinsicElements["pre"] & ExtraProps) {
	const fenced = readFencedCode(node);
	if (fenced === null) {
		return (
			<pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs">
				{children}
			</pre>
		);
	}
	return <DocCodeBlock code={fenced.code} language={fenced.language} />;
}

const COMPONENTS: Components = {
	a: DocLink,
	blockquote: DocCallout,
	code: ({ children }) => (
		<code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground text-xs">
			{children}
		</code>
	),
	h2: ({ children }) => <h2 className={HEADING_2_CLASS}>{children}</h2>,
	h3: ({ children }) => <h3 className={HEADING_3_CLASS}>{children}</h3>,
	h4: ({ children }) => <h4 className={HEADING_4_CLASS}>{children}</h4>,
	hr: () => <Separator />,
	ol: ({ children }) => (
		<ol className={`list-decimal ${LIST_CLASS}`}>{children}</ol>
	),
	p: ({ children }) => <p className="break-words">{children}</p>,
	pre: DocPre,
	strong: ({ children }) => (
		<strong className="font-semibold text-foreground">{children}</strong>
	),
	table: ({ children }) => (
		<div className="overflow-x-auto">
			<table className="w-full border-collapse text-xs">{children}</table>
		</div>
	),
	td: ({ children }) => <td className={CELL_CLASS}>{children}</td>,
	th: ({ children }) => (
		<th className={`${CELL_CLASS} text-left font-medium text-foreground`}>
			{children}
		</th>
	),
	ul: ({ children }) => (
		<ul className={`list-disc ${LIST_CLASS}`}>{children}</ul>
	),
};

export interface DocMarkdownProps {
	text: string;
}

export function DocMarkdown({ text }: DocMarkdownProps) {
	return (
		<div className="flex flex-col gap-4 text-muted-foreground text-sm leading-relaxed">
			<Markdown components={COMPONENTS} remarkPlugins={REMARK_PLUGINS}>
				{text}
			</Markdown>
		</div>
	);
}
