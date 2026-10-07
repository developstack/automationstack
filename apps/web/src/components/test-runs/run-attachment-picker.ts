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
		if (canUpload) {
			document.addEventListener("paste", onPaste);
		}
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
