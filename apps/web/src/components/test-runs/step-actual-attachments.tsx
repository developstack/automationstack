import { Button } from "@automationstack/ui/components/button";
import { Trash2Icon } from "lucide-react";
import { useCallback } from "react";

import { AddScreenshotButton } from "@/components/cases/add-screenshot-button";
import { MediaGallery } from "@/components/media/media-gallery";
import type { MediaItem } from "@/components/media/media-item";
import { useRemoveConfirm } from "@/components/media/use-remove-confirm";
import { ActualAttachmentRemoveDialog } from "@/components/test-runs/actual-attachment-remove-dialog";
import { ATTACHMENT_ACCEPT_ATTRIBUTE } from "@/components/test-runs/attachment-policy";
import type { StepAttachments } from "@/components/test-runs/run-step-attachments-context";

function RemoveAction({
	id,
	onAsk,
}: {
	id: string;
	onAsk: (id: string) => void;
}) {
	const ask = useCallback(() => onAsk(id), [id, onAsk]);
	return (
		<Button onClick={ask} size="sm" type="button" variant="ghost">
			<Trash2Icon data-icon="inline-start" />
			删除这个实际附件
		</Button>
	);
}

interface StepActualAttachmentsProps {
	attachments: StepAttachments;
	position: number;
}

/**
 * 实际结果一栏中的实际附件：缩略图条，录屏有播放图标，点击打开大图浏览。
 * 编辑时末尾是「+」按钮，大图浏览中可以删除当前的文件，删除前确认。
 */
export function StepActualAttachments({
	attachments,
	position,
}: StepActualAttachmentsProps) {
	const removal = useRemoveConfirm(attachments.remove);
	const { ask } = removal;
	const { canRemove } = attachments;
	const renderActions = useCallback(
		(item: MediaItem) =>
			canRemove && item.status === undefined ? (
				<RemoveAction id={item.id} onAsk={ask} />
			) : null,
		[ask, canRemove]
	);
	return (
		<>
			<MediaGallery
				items={attachments.items}
				label={`第 ${position} 步实际附件`}
				renderActions={renderActions}
				titlePrefix={`第 ${position} 步 · 实际附件`}
			>
				{attachments.canAdd ? (
					<AddScreenshotButton
						accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
						label={`给第 ${position} 步添加实际附件`}
						onAdd={attachments.addFiles}
					/>
				) : null}
			</MediaGallery>
			<ActualAttachmentRemoveDialog
				onCancel={removal.cancel}
				onConfirm={removal.confirm}
				open={removal.open}
			/>
		</>
	);
}
