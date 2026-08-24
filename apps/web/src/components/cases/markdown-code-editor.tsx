/**
 * 活跃态的 markdown 编辑器。整个模块只在浏览器里被动态 import
 * （markdown-field.tsx 里的 lazy + ClientOnly），因为 `@codemirror/view`
 * 在 import 期就会读 `navigator`，进了 SSR bundle 会直接炸掉 /projects/$projectId。
 */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { type RefObject, useEffect, useRef, useState } from "react";

import { markdownExtensions } from "@/components/cases/markdown-extensions";
import { MarkdownToolbar } from "@/components/cases/markdown-toolbar";

interface MarkdownCodeEditorProps {
	ariaLabel: string;
	/** 从 <textarea> 交接过来的光标位置，保证点哪儿进来光标就在哪儿。 */
	initialCaret: number;
	onChange: (value: string) => void;
	onEscape: () => void;
	/** 剪贴板里带图片时接管这次粘贴；返回 true 表示已接管。 */
	onPasteFiles?: (files: File[]) => boolean;
	/**
	 * 把视图实例交给字段。字段要靠它把上传完成的图片 `dispatch` 进 doc——
	 * 编辑器是 uncontrolled 的，改父级 state 不会写回 doc。
	 */
	onView?: (view: EditorView | null) => void;
	placeholder: string;
	value: string;
}

/**
 * 挂一个视图到宿主节点上，并把光标放到交接过来的位置。
 *
 * 收的是**转发 ref 而不是 props 快照**：视图只在挂载时建一次，回调若在这里被
 * 闭包住，之后父级重渲拿到的新回调就再也进不来。贴图那条链路对此尤其敏感——
 * 占位替换发生在几秒之后，那时挂载时的那个 `onChange` 早就过期了。
 */
function createEditorView(
	host: HTMLDivElement,
	callbacks: RefObject<MarkdownCodeEditorProps>
): EditorView {
	const props = callbacks.current;
	const editor = new EditorView({
		parent: host,
		state: EditorState.create({
			doc: props.value,
			extensions: markdownExtensions({
				ariaLabel: props.ariaLabel,
				onChange: (next) => callbacks.current.onChange(next),
				onEscape: () => callbacks.current.onEscape(),
				onPasteFiles: (files) =>
					callbacks.current.onPasteFiles?.(files) ?? false,
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
		const editor = host === null ? null : createEditorView(host, callbacks);
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
	const { onView } = props;

	// 视图建好/销毁时通知字段。销毁那一次必须报上去，否则字段会拿着一个已经
	// destroy 掉的实例去 dispatch。
	useEffect(() => {
		onView?.(view);
		return () => onView?.(null);
	}, [onView, view]);

	return (
		// min-w-0：分栏预览把它放进 grid 轨道，默认的 min-width:auto 会让长内容
		// 顶宽轨道，最后把抽屉撑出横向滚动条。
		<div className="flex w-full min-w-0 flex-col rounded-md border border-input bg-transparent focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50 dark:bg-input/30">
			<div className="min-h-16" ref={setHost} />
			<MarkdownToolbar view={view} />
		</div>
	);
}
