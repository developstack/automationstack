/**
 * markdown 字段的「textarea ⇄ CodeMirror」切换状态机。
 *
 * 从 markdown-field.tsx 拆出来，一是给那边留行数余量，二是这台状态机与
 * 「渲染成什么」其实无关：它只回答「此刻该由谁接管输入」，以及在 Esc 之后
 * 把焦点还回 textarea。字段那边照着 `editing` 挑元素就行。
 *
 * chunk 预取也跟着一起搬：预取的时机正是这台状态机挂载的时机，两者放一处，
 * 将来谁改「什么时候拉起编辑器」都不会漏掉「什么时候开始下载它」。
 */
import {
	type FocusEvent as ReactFocusEvent,
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

let chunkRequested = false;

/**
 * 字段一挂载就把编辑器 chunk 预取下来。等到用户点进输入框才开始下载的话，
 * 中间那一帧会看到 Suspense 兜底、焦点也会掉；预取后聚焦切换是同步的。
 */
function preloadEditorChunk() {
	if (chunkRequested) {
		return;
	}
	chunkRequested = true;
	import("@/components/cases/markdown-code-editor").catch(() => {
		// 预取失败无所谓：真正聚焦时 lazy() 会自己再试一次。
		chunkRequested = false;
	});
}

/**
 * 字段的三态。用状态机而不是「一个 editing 布尔 + 一个抑制标志的 ref」：
 * Esc 退出后要把焦点还给 textarea，而那次 focus() 不能又把编辑器拉起来，
 * 所以「刚按过 Esc」本身就是一个态。
 */
type FieldMode = "editing" | "escaped" | "idle";

/** textarea ⇄ 编辑器的切换状态机。 */
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

	/**
	 * 按过 Esc 之后焦点还在 textarea 上，再点它不会触发 focus 事件，
	 * 光靠 handleFocus 就再也回不到编辑器了。所以点击也能重新拉起编辑器。
	 */
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

/** 字段拿到的那份切换句柄；调用方（markdown-field.tsx）按它挑输入控件。 */
export type FieldActivation = ReturnType<typeof useFieldActivation>;
