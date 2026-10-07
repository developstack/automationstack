import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
	defineLanguageFacet,
	HighlightStyle,
	Language,
	syntaxHighlighting,
} from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";

import { markdownParser } from "@/components/cases/markdown-parser";

const markdownLanguage = new Language(
	defineLanguageFacet({
		commentTokens: { block: { close: "-->", open: "<!--" } },
	}),
	markdownParser,
	[],
	"markdown"
);

const highlightStyle = HighlightStyle.define([
	{ fontSize: "1.25em", fontWeight: "600", tag: tags.heading1 },
	{ fontSize: "1.15em", fontWeight: "600", tag: tags.heading2 },
	{ fontWeight: "600", tag: [tags.heading3, tags.heading4] },
	{ fontWeight: "600", tag: tags.strong },
	{ fontStyle: "italic", tag: tags.emphasis },
	{ tag: tags.strikethrough, textDecoration: "line-through" },
	{
		color: "var(--primary)",
		fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
		tag: tags.monospace,
	},
	{ color: "var(--primary)", tag: tags.link, textDecoration: "underline" },
	{ color: "var(--muted-foreground)", tag: tags.quote },
	{ color: "var(--muted-foreground)", tag: tags.list },
	{
		color: "var(--muted-foreground)",
		opacity: "0.65",
		tag: tags.processingInstruction,
	},
]);

const editorTheme = EditorView.theme({
	".cm-content": {
		caretColor: "var(--foreground)",
		padding: "0.5rem 0.625rem",
	},
	".cm-line": { padding: "0" },
	".cm-placeholder": { color: "var(--muted-foreground)" },
	".cm-scroller": { fontFamily: "inherit", lineHeight: "1.625" },
	"&": {
		backgroundColor: "transparent",
		color: "var(--foreground)",
		fontSize: "0.875rem",
	},
	"&.cm-focused": { outline: "none" },
});

interface MarkdownExtensionOptions {
	ariaLabel: string;
	onChange: (value: string) => void;
	onEscape: () => void;
	onPasteFiles?: (files: File[]) => boolean;
	placeholder: string;
}

export function markdownExtensions(
	options: MarkdownExtensionOptions
): Extension[] {
	return [
		keymap.of([
			{
				key: "Escape",
				run: () => {
					options.onEscape();
					return true;
				},
			},
			...defaultKeymap,
			...historyKeymap,
		]),
		history(),
		markdownLanguage.extension,
		syntaxHighlighting(highlightStyle),
		editorTheme,
		EditorView.lineWrapping,
		EditorView.contentAttributes.of({
			"aria-label": options.ariaLabel,
			"aria-multiline": "true",
		}),
		placeholder(options.placeholder),
		EditorView.domEventHandlers({
			paste: (event) => {
				const files = [...(event.clipboardData?.files ?? [])];
				if (files.length === 0) {
					return false;
				}
				return options.onPasteFiles?.(files) ?? false;
			},
		}),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				options.onChange(update.state.doc.toString());
			}
		}),
	];
}
