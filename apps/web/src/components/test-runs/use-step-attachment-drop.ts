import {
	type ClipboardEvent,
	type DragEvent,
	useCallback,
	useState,
} from "react";

const FILES_TYPE = "Files";

/** 拖动的内容包括文件。拖动文字时不处理，文字照常拖入输入框。 */
function draggingFiles(event: DragEvent<HTMLElement>): boolean {
	return [...event.dataTransfer.types].includes(FILES_TYPE);
}

/**
 * 拖入实际结果一栏、在实际结果输入框中粘贴文件：都交给 addFiles。文字照常粘贴。
 * 不能添加时也阻止拖入的文件，否则浏览器会在当前页打开这个文件，没有保存的实际结果会丢失。
 */
export function useStepAttachmentDrop(
	canAdd: boolean,
	addFiles: (files: readonly File[]) => void
) {
	const [dragging, setDragging] = useState(false);
	const handleDragOver = useCallback(
		(event: DragEvent<HTMLElement>) => {
			if (!draggingFiles(event)) {
				return;
			}
			event.preventDefault();
			setDragging(canAdd);
		},
		[canAdd]
	);
	const handleDragLeave = useCallback(() => setDragging(false), []);
	const handleDrop = useCallback(
		(event: DragEvent<HTMLElement>) => {
			setDragging(false);
			if (!draggingFiles(event)) {
				return;
			}
			event.preventDefault();
			if (canAdd) {
				addFiles([...event.dataTransfer.files]);
			}
		},
		[addFiles, canAdd]
	);
	const handlePaste = useCallback(
		(event: ClipboardEvent<HTMLElement>) => {
			const files = [...event.clipboardData.files];
			if (!canAdd || files.length === 0) {
				return;
			}
			event.preventDefault();
			addFiles(files);
		},
		[addFiles, canAdd]
	);
	return {
		dragging,
		handleDragLeave,
		handleDragOver,
		handleDrop,
		handlePaste,
	};
}
