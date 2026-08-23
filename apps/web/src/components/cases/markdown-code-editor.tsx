/**
 * 活跃态的 markdown 编辑器。整个模块只在浏览器里被动态 import
 * （markdown-field.tsx 里的 lazy + ClientOnly），因为 `@codemirror/view`
 * 在 import 期就会读 `navigator`，进了 SSR bundle 会直接炸掉 /projects/$projectId。
 */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";

import { markdownExtensions } from "@/components/cases/markdown-extensions";
import { MarkdownToolbar } from "@/components/cases/markdown-toolbar";

interface MarkdownCodeEditorProps {
	ariaLabel: string;
	/** 从 <textarea> 交接过来的光标位置，保证点哪儿进来光标就在哪儿。 */
	initialCaret: number;
	onChange: (value: string) => void;
	onEscape: () => void;
	placeholder: string;
	value: string;
}

/** 挂一个视图到宿主节点上，并把光标放到交接过来的位置。 */
function createEditorView(
	host: HTMLDivElement,
	props: MarkdownCodeEditorProps
): EditorView {
	const editor = new EditorView({
		parent: host,
		state: EditorState.create({
			doc: props.value,
			extensions: markdownExtensions({
				ariaLabel: props.ariaLabel,
				onChange: (next) => props.onChange(next),
				onEscape: () => props.onEscape(),
				placeholder: props.placeholder,
			}),
		}),
	});
	const caret = Math.min(props.initialCaret, editor.state.doc.length);
	editor.dispatch({ selection: { anchor: caret } });
	editor.focus();
	return editor;
}

/** 建视图 + 落焦；卸载时销毁。回调用 ref 转发，避免重建视图。 */
function useEditorView(props: MarkdownCodeEditorProps) {
	// 用 state 而不是 ref 承接宿主节点：ref 回调把节点交回来时会触发一次
	// 重渲染，effect 才有确定的挂载时机，也不必再判空。
	const [host, setHost] = useState<HTMLDivElement | null>(null);
	const [view, setView] = useState<EditorView | null>(null);
	const callbacks = useRef(props);
	callbacks.current = props;

	useEffect(() => {
		const editor =
			host === null ? null : createEditorView(host, callbacks.current);
		setView(editor);
		return () => {
			setView(null);
			editor?.destroy();
		};
	}, [host]);

	return { setHost, view };
}

/**
 * 外层容器复刻 Textarea 的边框与焦点环（focus-within 而不是 focus-visible，
 * 因为真正拿到焦点的是内部的 contenteditable）。
 */
export function MarkdownCodeEditor(props: MarkdownCodeEditorProps) {
	const { setHost, view } = useEditorView(props);

	return (
		<div className="flex w-full flex-col rounded-md border border-input bg-transparent focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50 dark:bg-input/30">
			<div className="min-h-16" ref={setHost} />
			<MarkdownToolbar view={view} />
		</div>
	);
}
