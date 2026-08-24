/**
 * 一个 markdown 字段的粘贴接管：把剪贴板里的图片交给上传编排层，并提供
 * 「往哪儿写」的两条通道。
 *
 * ## 为什么写入要分两条路
 *
 * 活跃态的编辑器是 **uncontrolled** 的：`markdown-code-editor.tsx` 里建视图的
 * effect 依赖只有 `[host]`，外部 `value` 变了不会写回 doc。所以只要编辑器还活着，
 * 任何写入都必须 `view.dispatch`——走 `onChange` 只会改父级 state，编辑器里
 * 一个字都不会变，而它下一次按键又会把旧 doc 整篇推回去，刚插进去的图就没了。
 *
 * 而上传是异步的（几百毫秒到几秒），这期间用户完全可能点走别的字段：
 * `useFocusOut` → idle → `editor.destroy()`。所以替换占位时要先问一句
 * `view.dom.isConnected`，编辑器已经不在文档里就退回「改父级 state」那条路。
 *
 * ## 为什么按文本找，不记位置
 *
 * 占位插进去之后用户还能继续打字、还能把编辑器点掉再点回来（那会销毁重建视图）。
 * 任何记下来的偏移量都会失效，而 `![](uploading:<uuid>)` 这串在正文里是唯一的。
 *
 * ⚠️ 本文件对 `@codemirror/view` 只有 **`import type`**（编译期即被抹掉），
 * 因此不会把 CodeMirror 拖进 SSR 依赖图——`/projects/$projectId` 是会 SSR 的。
 */
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
import type { CasePasteTarget } from "@/components/cases/use-case-paste-upload";

/** 只接管图片；别的文件（PDF、zip）与纯文本一样放行给浏览器默认行为。 */
const IMAGE_MIME_PREFIX = "image/";

/**
 * 字段正文的对账状态。
 *
 * `pending` 是「我们刚写下、但父级 state 还没回流」的那一版正文。没有它的话，
 * 两次替换挨得太近时后一次会读到回流前的旧值，把前一次的结果盖掉。
 * 每次渲染看到 `value` 变了就把它丢掉——要么是我们的写入回来了，
 * 要么是用户自己打了字，两种情况都该以父级为准。
 */
interface FieldText {
	pending: string | null;
	seen: string;
}

interface FieldWriter {
	current: () => string;
	write: (next: string) => void;
}

/** 编辑器还在文档里吗。销毁后 `view.dom` 仍然是个游离节点，只能问 isConnected。 */
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
	// 未聚焦态：原生 textarea，按它自己的选区插。没有 textarea（字段刚好在
	// 重渲）时退化成追加到末尾，总比把这次粘贴丢掉强。
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
		// 编辑器里已经没有这段占位（用户自己删了）——不往回塞，直接落到下面
		// 那条路再对一次字段值，两边都没有就什么也不做。
	}
	const base = writer.current();
	const next = replaceCaseImageRef(base, from, to);
	if (next !== base) {
		writer.write(next);
	}
}

export interface MarkdownFieldPasteOptions {
	onChange: (value: string) => void;
	/** 未聚焦态那个原生 textarea，用来读插入位置。 */
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	value: string;
}

export interface MarkdownFieldPaste {
	/** 给 CodeMirror 的 `onPasteFiles`：返回 true 表示已接管（要 preventDefault）。 */
	handlePasteFiles: (files: File[]) => boolean;
	/** 给未聚焦态 textarea 的 `onPaste`：还没聚焦就 Ctrl+V 也要能贴。 */
	handleTextareaPaste: (
		event: ReactClipboardEvent<HTMLTextAreaElement>
	) => void;
	/** 活跃态编辑器把自己的 view 交上来（卸载时交 null）。 */
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

	// 渲染期对账，见 FieldText 的注释。放在这里而不是 effect 里：粘贴回调可能在
	// effect 跑之前就被调用，那时读到的必须已经是最新的口径。
	if (textRef.current.seen !== value) {
		textRef.current = { pending: null, seen: value };
	}

	/**
	 * 刻意**不**判「字段是否还挂着」：上传回来时这个字段可能已经没了（抽屉关了、
	 * 这一步被删了），但那两种情况下 `onChange` 本身就是安全的空操作——React 19
	 * 对已卸载组件的 setState 不再告警，而「按 id 改某一步」在那一步已被删掉时
	 * 匹配不到任何一行。加一个 mounted ref 反而要在渲染期维护一份生命周期状态。
	 */
	const writer = useMemo<FieldWriter>(
		() => ({
			current: () => textRef.current.pending ?? textRef.current.seen,
			write: (next) => {
				textRef.current.pending = next;
				changeRef.current(next);
			},
		}),
		[]
	);

	const target = useMemo<CasePasteTarget>(
		() => ({
			insert: (text) =>
				insertAtCaret(viewRef.current, textareaRef.current, writer, text),
			replace: (from, to) => replaceRef(viewRef.current, writer, from, to),
		}),
		[textareaRef, writer]
	);

	const handlePasteFiles = useCallback(
		(files: File[]) => {
			if (uploadPasted === null) {
				return false;
			}
			// 只在真的有图片时接管。粘一段纯文本、或粘一个 zip，clipboardData.files
			// 里要么是空的要么不是图，这次粘贴原样交回浏览器。
			const images = files.filter((file) =>
				file.type.startsWith(IMAGE_MIME_PREFIX)
			);
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
