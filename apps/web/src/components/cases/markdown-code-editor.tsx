import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { type RefObject, useEffect, useRef, useState } from "react";

import { markdownExtensions } from "@/components/cases/markdown-extensions";
import { MarkdownToolbar } from "@/components/cases/markdown-toolbar";

interface MarkdownCodeEditorProps {
	ariaLabel: string;
	initialCaret: number;
	onChange: (value: string) => void;
	onEscape: () => void;
	onPasteFiles?: (files: File[]) => boolean;
	onView?: (view: EditorView | null) => void;
	placeholder: string;
	value: string;
}

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

function useEditorView(props: MarkdownCodeEditorProps) {
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

export function MarkdownCodeEditor(props: MarkdownCodeEditorProps) {
	const { setHost, view } = useEditorView(props);
	const { onView } = props;

	useEffect(() => {
		onView?.(view);
		return () => onView?.(null);
	}, [onView, view]);

	return (
		<div className="flex w-full min-w-0 flex-col rounded-md border border-input bg-transparent focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50 dark:bg-input/30">
			<div className="min-h-16" ref={setHost} />
			<MarkdownToolbar view={view} />
		</div>
	);
}
