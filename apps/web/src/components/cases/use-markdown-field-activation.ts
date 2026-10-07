import {
	type FocusEvent as ReactFocusEvent,
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

let chunkRequested = false;

function preloadEditorChunk() {
	if (chunkRequested) {
		return;
	}
	chunkRequested = true;
	import("@/components/cases/markdown-code-editor").catch(() => {
		chunkRequested = false;
	});
}

type FieldMode = "editing" | "escaped" | "idle";

export function useFieldActivation() {
	const [mode, setMode] = useState<FieldMode>("idle");
	const caretRef = useRef(0);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
			caretRef.current =
				event.target.selectionStart ?? event.target.value.length;
			setMode("editing");
		},
		[mode]
	);

	const handleClick = useCallback(
		(event: ReactMouseEvent<HTMLTextAreaElement>) => {
			if (mode !== "escaped") {
				return;
			}
			const target = event.currentTarget;
			caretRef.current = target.selectionStart ?? target.value.length;
			setMode("editing");
		},
		[mode]
	);

	const handleFocusOut = useCallback(() => setMode("idle"), []);
	const handleEscape = useCallback(() => setMode("escaped"), []);

	return {
		caretRef,
		editing: mode === "editing",
		handleClick,
		handleEscape,
		handleFocus,
		handleFocusOut,
		textareaRef,
	};
}

export type FieldActivation = ReturnType<typeof useFieldActivation>;
