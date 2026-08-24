/**
 * CodeMirror 6 wiring for the case markdown fields.
 *
 * 编辑缓冲区里存的就是 markdown 原文本身，没有「HTML ⇄ markdown」的往返：
 * 语法标记（`**`、`- `、`#`）始终可见，只是被加上排版样式。这样做的三个理由：
 *
 * 1. 库里存量的用例步骤全是纯文本，里面有 `user_id`、`3 * 4`、`?a=1&b=2`
 *    这类字符。任何 remark 往返都会把它们改写成 `user\_id` / `3 \* 4` /
 *    `?a=1\&b=2`（见任务报告里的实测），既污染存量数据，也会让版本对比的
 *    diffWords 冒出一堆假改动。原文即缓冲区 = 恒等变换，不可能丢字符。
 * 2. `field-diff.ts` 对原始字符串做逐词 diff，字符串没变，链路就不用动。
 * 3. MCP 批量导入与 AI 生成提案写进来的仍是纯文本，无需迁移。
 *
 * 这个模块只在浏览器里被动态 import（见 markdown-field.tsx），
 * `@codemirror/view` 在 import 期就会读 `navigator`，不能进 SSR bundle。
 */
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

/**
 * `@lezer/markdown` 的 parser 是 MarkdownParser 而不是 LRParser，
 * 所以用 Language 基类包装（LRLanguage.define 只收 LRParser）。
 *
 * parser 本身住在 `markdown-parser.ts`：只读预览（`markdown-doc.ts`）要在 SSR 里
 * 用同一个 parser，而它不能碰本文件——`@codemirror/view` 进不了 SSR bundle。
 * 选它而不选 `@codemirror/lang-markdown` 的理由写在那个文件的头注释里。
 */
const markdownLanguage = new Language(
	defineLanguageFacet({
		commentTokens: { block: { close: "-->", open: "<!--" } },
	}),
	markdownParser,
	[],
	"markdown"
);

/**
 * 语法标记（HeaderMark / EmphasisMark / CodeMark…）刻意保持可见并调暗，
 * 而不是隐藏：隐藏等于让屏幕上的字符数与存储的字符数对不上，
 * 存量纯文本里的 `- 点击登录` 会突然少一个 `-`。调暗既提示「这是格式」，
 * 又保证所见即所存。
 */
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

/**
 * 排版对齐 packages/ui 的 Textarea：0.875rem 字号、px-2.5 py-2 内边距，
 * 未聚焦时显示的 <textarea> 与聚焦后挂载的编辑器像素级同宽同高，
 * 焦点切换不会有跳动。边框与焦点环留给外层容器画（focus-within）。
 */
const editorTheme = EditorView.theme({
	".cm-content": {
		caretColor: "var(--foreground)",
		padding: "0.5rem 0.625rem",
	},
	".cm-line": { padding: "0" },
	".cm-placeholder": { color: "var(--muted-foreground)" },
	// 1.625 = Tailwind 的 leading-relaxed，未聚焦态的 <textarea> 用的就是它，
	// 两边行高一致，聚焦切换时同样的文本占同样的高度，不会跳。
	".cm-scroller": { fontFamily: "inherit", lineHeight: "1.625" },
	"&": {
		backgroundColor: "transparent",
		color: "var(--foreground)",
		fontSize: "0.875rem",
	},
	"&.cm-focused": { outline: "none" },
});

interface MarkdownExtensionOptions {
	/** 编辑区的可访问名，读屏在进入 contenteditable 时播报。 */
	ariaLabel: string;
	onChange: (value: string) => void;
	/**
	 * Esc 的语义：退出编辑器回到未聚焦态，而不是关抽屉。
	 * 返回 true 让 CodeMirror 吞掉这次按键。
	 */
	onEscape: () => void;
	/**
	 * 剪贴板里带图片时接管这次粘贴。返回 true = 已接管，CodeMirror 会替我们
	 * `preventDefault()` 并跳过内置的 paste 处理；返回 false = 原样放行。
	 *
	 * ⚠️ 判定必须严到「真的有图片文件」为止：粘纯文本（往步骤里贴一段日志）
	 * 走的是同一个事件，误接管一次就是把用户的文本吞掉。
	 */
	onPasteFiles?: (files: File[]) => boolean;
	placeholder: string;
}

/** 一个 markdown 字段所需的全部 CodeMirror 扩展。 */
export function markdownExtensions(
	options: MarkdownExtensionOptions
): Extension[] {
	return [
		// 自己的 Escape 绑定必须排在 defaultKeymap 之前：standardKeymap 也占了 Escape。
		keymap.of([
			{
				key: "Escape",
				run: () => {
					options.onEscape();
					return true;
				},
			},
			// 刻意不加 indentWithTab：Tab 必须能把焦点带出编辑器，
			// 否则键盘用户会被困在 contenteditable 里。
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
		/**
		 * 粘贴挂在**编辑器实例**上，不是 document 上。
		 *
		 * `test-runs/run-attachments.tsx` 那份挂 document 是对的——那里只有一个
		 * 附件区，页面任何位置粘贴都该落进去。这里恰恰相反：同屏可能有 40 个
		 * markdown 字段，「贴到哪个字段的哪个光标位」只有拿到事件的那个实例知道。
		 *
		 * 由 `computeHandlers` 的顺序保证我们排在内置 paste 处理之前，
		 * 所以放行时内置行为一点不受影响（见 CM6 的 runHandlers）。
		 */
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
