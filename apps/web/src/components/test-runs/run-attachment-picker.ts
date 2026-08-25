/**
 * 三条上传入口共用的那点状态：拖放高亮、隐藏 input 的 ref、粘贴监听。
 *
 * 抽成 hook 而不是子组件是**有意的**。这些 hook 必须继续跑在 `RunAttachments`
 * 这一个组件实例上、并保持原来的相对顺序；一旦搬进拖放区那个子组件，
 * 粘贴监听的挂载时机就跟着子树的条件渲染走了——`canUpload` 为假时子组件
 * 压根不渲染，effect 里那条「不能传就不挂监听」的分支再也不会被求值，
 * 语义从「按条件挂」变成「按渲染挂」。两者在 locked 翻转的那一帧并不等价。
 */

import {
	type ChangeEvent,
	type DragEvent,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { useUploadAttachments } from "@/components/test-runs/use-attachment-upload";

export interface AttachmentPickerOptions {
	/** 已提交或存储不可用时为 false：三条入口一起关。 */
	canUpload: boolean;
	upload: ReturnType<typeof useUploadAttachments>;
}

export interface AttachmentPicker {
	dragging: boolean;
	handleDragLeave: () => void;
	handleDragOver: (event: DragEvent<HTMLDivElement>) => void;
	handleDrop: (event: DragEvent<HTMLDivElement>) => void;
	handleInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
	handlePick: () => void;
	inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * 粘贴挂在 document 上而不是某个容器上：用户截完图的动作是「回到页面按
 * Ctrl+V」，不会先去点一下附件区。挂在容器上要求焦点已经在里面，
 * 那条路径几乎没人会走，等于这个功能不存在。
 *
 * 代价是页面上任何位置的粘贴都会被接走，所以只在**确实带文件**的
 * clipboardData 上动手——粘贴文字（比如往说明框里贴一段日志）完全不受影响。
 */
function usePasteUpload(
	canUpload: boolean,
	uploadFiles: (files: readonly File[]) => void
): void {
	useEffect(() => {
		const onPaste = (event: ClipboardEvent) => {
			const files = [...(event.clipboardData?.files ?? [])];
			if (files.length === 0) {
				return;
			}
			event.preventDefault();
			uploadFiles(files);
		};
		// 不能传时**根本不挂**，而不是挂上再在回调里判断：回调里那句
		// preventDefault 会连带把「往说明框里粘贴一段日志」也吃掉。
		if (canUpload) {
			document.addEventListener("paste", onPaste);
		}
		// 清理函数无条件返回。没挂过的监听 removeEventListener 是规范里的
		// no-op，所以这条清理在两种分支下都正确；反过来「挂了才返回清理」
		// 会让这个 effect 有两种返回形态，读的人每次都得先确认哪条路径漏了
		// 清理才敢改它——那正是 consistent-return 想拦下的东西。
		return () => document.removeEventListener("paste", onPaste);
	}, [canUpload, uploadFiles]);
}

export function useAttachmentPicker({
	canUpload,
	upload,
}: AttachmentPickerOptions): AttachmentPicker {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);

	const uploadFiles = useCallback(
		(files: readonly File[]) => {
			if (canUpload && files.length > 0) {
				upload.mutate(files);
			}
		},
		[canUpload, upload]
	);

	usePasteUpload(canUpload, uploadFiles);

	const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
		// 不 preventDefault 的话浏览器会直接用文件替换整个页面
		event.preventDefault();
		setDragging(true);
	}, []);
	const handleDragLeave = useCallback(() => setDragging(false), []);
	const handleDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			setDragging(false);
			uploadFiles([...event.dataTransfer.files]);
		},
		[uploadFiles]
	);

	const handlePick = useCallback(() => inputRef.current?.click(), []);
	const handleInputChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			uploadFiles([...(event.target.files ?? [])]);
			// 清空 value：连续两次选同一个文件时 change 事件不会再触发
			event.target.value = "";
		},
		[uploadFiles]
	);

	return {
		dragging,
		handleDragLeave,
		handleDragOver,
		handleDrop,
		handleInputChange,
		handlePick,
		inputRef,
	};
}
