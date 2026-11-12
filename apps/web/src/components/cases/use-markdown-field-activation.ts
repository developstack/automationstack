import type { EditorView } from "@codemirror/view";
import {
	type FocusEvent as ReactFocusEvent,
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import type { MarkdownCodeEditor } from "@/components/cases/markdown-code-editor";

let chunkRequested = false;
let loadedEditor: typeof MarkdownCodeEditor | null = null;

function preloadEditorChunk() {
	if (chunkRequested) {
		return;
	}
	chunkRequested = true;
	import("@/components/cases/markdown-code-editor")
		.then((editorModule) => {
			loadedEditor = editorModule.MarkdownCodeEditor;
		})
		.catch(() => {
			chunkRequested = false;
		});
}

/**
 * 编辑器的代码已经加载时返回编辑器组件，否则返回 null。
 * 已经加载时直接渲染编辑器，不经过 Suspense：Suspense 推迟显示编辑器，焦点在这段时间中离开字段。
 */
export function loadedMarkdownEditor(): typeof MarkdownCodeEditor | null {
	return loadedEditor;
}

/** 焦点怎样离开字段：moved 表示用户把焦点移到另一个元素，lost 表示焦点没有落到任何元素上。 */
export type FieldFocusLoss = "lost" | "moved";

type FieldMode = "editing" | "escaped" | "idle";

/**
 * textarea 换成编辑器时，textarea 被删除，焦点没有落到任何元素上，直到编辑器显示并取得焦点。
 * 在这段时间中，焦点丢失不退出编辑。
 */
function useEditorSwap(setMode: (mode: FieldMode) => void) {
	const caretRef = useRef(0);
	const editorPendingRef = useRef(false);

	const startEditing = useCallback(
		(caret: number) => {
			caretRef.current = caret;
			editorPendingRef.current = true;
			setMode("editing");
		},
		[setMode]
	);

	const handleFocusOut = useCallback(
		(loss: FieldFocusLoss) => {
			if (loss === "lost" && editorPendingRef.current) {
				return;
			}
			editorPendingRef.current = false;
			setMode("idle");
		},
		[setMode]
	);

	const handleEditorView = useCallback((view: EditorView | null) => {
		if (view !== null) {
			editorPendingRef.current = false;
		}
	}, []);

	return { caretRef, handleEditorView, handleFocusOut, startEditing };
}

export function useFieldActivation() {
	const [mode, setMode] = useState<FieldMode>("idle");
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const { caretRef, handleEditorView, handleFocusOut, startEditing } =
		useEditorSwap(setMode);

	useEffect(() => preloadEditorChunk(), []);

	useEffect(() => {
		if (mode === "escaped") {
			textareaRef.current?.focus();
		}
	}, [mode]);

	const handleFocus = useCallback(
		(event: ReactFocusEvent<HTMLTextAreaElement>) => {
			if (mode === "escaped") {
				return;
			}
			startEditing(event.target.selectionStart ?? event.target.value.length);
		},
		[mode, startEditing]
	);

	const handleClick = useCallback(
		(event: ReactMouseEvent<HTMLTextAreaElement>) => {
			if (mode !== "escaped") {
				return;
			}
			const target = event.currentTarget;
			startEditing(target.selectionStart ?? target.value.length);
		},
		[mode, startEditing]
	);

	const handleEscape = useCallback(() => setMode("escaped"), []);

	return {
		caretRef,
		editing: mode === "editing",
		handleClick,
		handleEditorView,
		handleEscape,
		handleFocus,
		handleFocusOut,
		textareaRef,
	};
}

export type FieldActivation = ReturnType<typeof useFieldActivation>;
