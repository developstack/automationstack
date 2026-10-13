import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { type RefObject, useEffect, useRef, useState } from "react";

import {
	MARKDOWN_EDITOR_BODY_CLASS,
	MARKDOWN_EDITOR_FRAME_CLASS,
} from "@/components/cases/markdown-editor-classes";
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
		<div className={MARKDOWN_EDITOR_FRAME_CLASS}>
			<div className={MARKDOWN_EDITOR_BODY_CLASS} ref={setHost} />
			<MarkdownToolbar view={view} />
		</div>
	);
}
