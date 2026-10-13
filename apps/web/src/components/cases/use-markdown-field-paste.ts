import type { EditorView } from "@codemirror/view";
import {
	type ClipboardEvent as ReactClipboardEvent,
	type RefObject,
	useCallback,
	useMemo,
	useRef,
} from "react";

import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import {
	buildCaseUploadingRef,
	replaceCaseImageRef,
} from "@/components/cases/case-upload-placeholder";
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

/** 上传列表中的按钮需要的两个操作：删掉占位，把焦点放回编辑区。 */
function useFieldUploadCommands(
	viewRef: RefObject<EditorView | null>,
	textareaRef: RefObject<HTMLTextAreaElement | null>,
	target: CasePasteTarget
) {
	const removeUploadingRef = useCallback(
		(token: string) => target.replace(buildCaseUploadingRef(token), ""),
		[target]
	);
	const focusField = useCallback(() => {
		const live = liveView(viewRef.current);
		if (live === null) {
			textareaRef.current?.focus();
			return;
		}
		live.focus();
	}, [textareaRef, viewRef]);
	return { focusField, removeUploadingRef };
}

export interface MarkdownFieldPasteOptions {
	onChange: (value: string) => void;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	value: string;
}

export interface MarkdownFieldPaste {
	/** 把焦点放回编辑区：编辑器打开时放到编辑器，否则放到 textarea。 */
	focusField: () => void;
	handlePasteFiles: (files: File[]) => boolean;
	handleTextareaPaste: (
		event: ReactClipboardEvent<HTMLTextAreaElement>
	) => void;
	/** 删掉一个上传中的占位。编辑器打开时改编辑器中的文字，否则改字段的值。 */
	removeUploadingRef: (token: string) => void;
	setView: (view: EditorView | null) => void;
}

/** 字段的写入目标：编辑器打开时改编辑器中的文字，否则改字段的值。 */
function useFieldTarget({
	onChange,
	textareaRef,
	value,
}: MarkdownFieldPasteOptions) {
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
	return { target, viewRef };
}

export function useMarkdownFieldPaste(
	options: MarkdownFieldPasteOptions
): MarkdownFieldPaste {
	const { textareaRef } = options;
	const { uploadPasted } = useCaseAttachments();
	const { target, viewRef } = useFieldTarget(options);

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

	const setView = useCallback(
		(view: EditorView | null) => {
			viewRef.current = view;
		},
		[viewRef]
	);

	const { focusField, removeUploadingRef } = useFieldUploadCommands(
		viewRef,
		textareaRef,
		target
	);

	return {
		focusField,
		handlePasteFiles,
		handleTextareaPaste,
		removeUploadingRef,
		setView,
	};
}
