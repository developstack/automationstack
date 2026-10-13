import type { EditorView } from "@codemirror/view";
import {
	type ClipboardEvent as ReactClipboardEvent,
	type RefObject,
	useCallback,
	useMemo,
	useRef,
} from "react";

import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import { replaceCaseImageRef } from "@/components/cases/case-upload-placeholder";
import type { CasePasteTarget } from "@/components/cases/use-case-upload-commands";

const IMAGE_MIME_PREFIX = "image/";

interface FieldText {
	pending: string | null;
	seen: string;
}

interface FieldWriter {
	current: () => string;
	write: (next: string) => void;
}

function liveView(view: EditorView | null): EditorView | null {
	return view?.dom.isConnected ? view : null;
}

function insertAtCaret(
	view: EditorView | null,
	textarea: HTMLTextAreaElement | null,
	writer: FieldWriter,
	text: string
) {
	const live = liveView(view);
	if (live !== null) {
		const range = live.state.selection.main;
		live.dispatch({
			changes: { from: range.from, insert: text, to: range.to },
			selection: { anchor: range.from + text.length },
		});
		return;
	}
	const base = writer.current();
	const from = textarea?.selectionStart ?? base.length;
	const to = textarea?.selectionEnd ?? from;
	writer.write(base.slice(0, from) + text + base.slice(to));
}

function replaceRef(
	view: EditorView | null,
	writer: FieldWriter,
	from: string,
	to: string
) {
	const live = liveView(view);
	if (live !== null) {
		const at = live.state.doc.toString().indexOf(from);
		if (at !== -1) {
			live.dispatch({
				changes: { from: at, insert: to, to: at + from.length },
			});
			return;
		}
	}
	const base = writer.current();
	const next = replaceCaseImageRef(base, from, to);
	if (next !== base) {
		writer.write(next);
	}
}

function pasteTarget(
	viewRef: RefObject<EditorView | null>,
	textareaRef: RefObject<HTMLTextAreaElement | null>,
	writer: FieldWriter
): CasePasteTarget {
	return {
		insert: (text) =>
			insertAtCaret(viewRef.current, textareaRef.current, writer, text),
		replace: (from, to) => replaceRef(viewRef.current, writer, from, to),
	};
}

function pastedImages(files: File[]): File[] {
	return files.filter((file) => file.type.startsWith(IMAGE_MIME_PREFIX));
}

function fieldWriter(
	textRef: RefObject<FieldText>,
	changeRef: RefObject<(value: string) => void>
): FieldWriter {
	return {
		current: () => textRef.current.pending ?? textRef.current.seen,
		write: (next) => {
			textRef.current.pending = next;
			changeRef.current(next);
		},
	};
}

export interface MarkdownFieldPasteOptions {
	onChange: (value: string) => void;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	value: string;
}

export interface MarkdownFieldPaste {
	handlePasteFiles: (files: File[]) => boolean;
	handleTextareaPaste: (
		event: ReactClipboardEvent<HTMLTextAreaElement>
	) => void;
	setView: (view: EditorView | null) => void;
}

export function useMarkdownFieldPaste(
	options: MarkdownFieldPasteOptions
): MarkdownFieldPaste {
	const { onChange, textareaRef, value } = options;
	const { uploadPasted } = useCaseAttachments();
	const viewRef = useRef<EditorView | null>(null);
	const changeRef = useRef(onChange);
	changeRef.current = onChange;
	const textRef = useRef<FieldText>({ pending: null, seen: value });

	if (textRef.current.seen !== value) {
		textRef.current = { pending: null, seen: value };
	}

	const writer = useMemo<FieldWriter>(
		() => fieldWriter(textRef, changeRef),
		[]
	);

	const target = useMemo<CasePasteTarget>(
		() => pasteTarget(viewRef, textareaRef, writer),
		[textareaRef, writer]
	);

	const handlePasteFiles = useCallback(
		(files: File[]) => {
			if (uploadPasted === null) {
				return false;
			}
			const images = pastedImages(files);
			if (images.length === 0) {
				return false;
			}
			uploadPasted(images, target);
			return true;
		},
		[target, uploadPasted]
	);

	const handleTextareaPaste = useCallback(
		(event: ReactClipboardEvent<HTMLTextAreaElement>) => {
			if (handlePasteFiles([...event.clipboardData.files])) {
				event.preventDefault();
			}
		},
		[handlePasteFiles]
	);

	const setView = useCallback((view: EditorView | null) => {
		viewRef.current = view;
	}, []);

	return { handlePasteFiles, handleTextareaPaste, setView };
}
