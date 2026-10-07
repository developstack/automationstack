import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { UploadIcon } from "lucide-react";

import {
	ATTACHMENT_ACCEPT_ATTRIBUTE,
	ATTACHMENT_ACCEPT_HINT,
	MAX_ATTACHMENT_HINT,
} from "@/components/test-runs/attachment-policy";
import type { AttachmentPicker } from "@/components/test-runs/run-attachment-picker";

export interface AttachmentDropZoneProps {
	picker: AttachmentPicker;
	uploading: boolean;
}

export function AttachmentDropZone({
	picker,
	uploading,
}: AttachmentDropZoneProps) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: 见上，拖放区没有等价的可聚焦语义
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: 同上，键盘路径由「选择文件」按钮承担
		<div
			className={cn(
				"flex flex-col items-center gap-2 rounded-md border border-dashed p-4 text-center",
				picker.dragging && "border-primary bg-accent"
			)}
			onDragLeave={picker.handleDragLeave}
			onDragOver={picker.handleDragOver}
			onDrop={picker.handleDrop}
		>
			<p className="text-muted-foreground text-xs">
				把截图 / 录屏拖到这里，或直接 Ctrl+V 粘贴
			</p>
			<Button
				aria-disabled={uploading || undefined}
				onClick={uploading ? undefined : picker.handlePick}
				type="button"
				variant="outline"
			>
				<UploadIcon aria-hidden="true" data-icon="inline-start" />
				{uploading ? "上传中…" : "选择文件"}
			</Button>
			<p className="text-muted-foreground text-xs">
				{ATTACHMENT_ACCEPT_HINT}，单个不超过 {MAX_ATTACHMENT_HINT}
			</p>
			<input
				accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
				className="sr-only"
				multiple={true}
				onChange={picker.handleInputChange}
				ref={picker.inputRef}
				tabIndex={-1}
				type="file"
			/>
		</div>
	);
}
