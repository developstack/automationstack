/**
 * 上传入口的那块 DOM：拖放区 + 「选择文件」按钮 + 藏起来的 file input。
 *
 * 纯展示。dragging、ref 与全部事件处理都留在 `RunAttachments` 上，由
 * `run-attachment-picker.ts` 打成一包传进来——那边有为什么不能把状态跟着
 * DOM 一起搬下来的完整理由。
 */
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
	/** 上传进行中：按钮换文案并停掉重复点击。 */
	uploading: boolean;
}

export function AttachmentDropZone({
	picker,
	uploading,
}: AttachmentDropZoneProps) {
	return (
		// 拖放是纯指针增强：键盘用户走下面那颗「选择文件」按钮，粘贴走
		// document 上的 paste 监听。给这个容器安一个 button role 只会向
		// 读屏宣告一个按回车毫无反应的控件，比不加 role 更糟，所以这里
		// 明确抑制这两条规则，而不是造一个假控件。
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
