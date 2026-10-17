import type { ColumnScreenshotKey } from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { Trash2Icon } from "lucide-react";
import { useCallback, useMemo } from "react";

import { AddScreenshotButton } from "@/components/cases/add-screenshot-button";
import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import {
	screenshotGroupNames,
	screenshotMediaItems,
} from "@/components/cases/column-screenshot-group";
import { MarkdownFieldUploads } from "@/components/cases/markdown-field-uploads";
import { ScreenshotRemoveDialog } from "@/components/cases/screenshot-remove-dialog";
import type { ColumnScreenshotGroupEdit } from "@/components/cases/use-column-screenshot-group";
import { MediaGallery } from "@/components/media/media-gallery";
import type { MediaItem } from "@/components/media/media-item";
import { useRemoveConfirm } from "@/components/media/use-remove-confirm";

const NO_FOCUS_RETURN = (): void => undefined;

function RemoveAction({
	entry,
	onAsk,
}: {
	entry: string;
	onAsk: (entry: string) => void;
}) {
	const ask = useCallback(() => onAsk(entry), [entry, onAsk]);
	return (
		<Button onClick={ask} size="sm" type="button" variant="ghost">
			<Trash2Icon data-icon="inline-start" />
			删除这张截图
		</Button>
	);
}

/** 缩略图：已保存的截图用签发的地址，上传中的截图用本地的预览地址和上传状态。 */
function useEditorItems(
	entries: readonly string[],
	groupLabel: string
): MediaItem[] {
	const { imageUrls, uploads } = useCaseAttachments();
	return useMemo(
		() => screenshotMediaItems(entries, groupLabel, imageUrls, uploads),
		[entries, groupLabel, imageUrls, uploads]
	);
}

interface ColumnScreenshotEditorProps {
	edit: ColumnScreenshotGroupEdit;
	group: ColumnScreenshotKey;
	position: number;
}

/**
 * 编辑区中输入框下方的一组截图：缩略图条，末尾是「+」按钮。
 * 大图浏览中可以删除当前的截图，删除前确认。上传中和上传失败的截图列在缩略图条下方。
 */
export function ColumnScreenshotEditor({
	edit,
	group,
	position,
}: ColumnScreenshotEditorProps) {
	const removal = useRemoveConfirm(edit.remove);
	const { groupLabel, label, titlePrefix } = screenshotGroupNames(
		position,
		group
	);
	const items = useEditorItems(edit.entries, groupLabel);
	const { ask } = removal;
	const renderActions = useCallback(
		(item: MediaItem) => <RemoveAction entry={item.id} onAsk={ask} />,
		[ask]
	);

	return (
		<>
			<MediaGallery
				items={items}
				label={label}
				renderActions={renderActions}
				titlePrefix={titlePrefix}
			>
				{edit.canAdd ? (
					<AddScreenshotButton
						label={`给第 ${position} 步添加${groupLabel}`}
						onAdd={edit.addFiles}
					/>
				) : null}
			</MediaGallery>
			{/* 条目中上传中的截图就是上传占位，所以连起来就是上传列表需要的文字 */}
			<MarkdownFieldUploads
				onRemoveRef={edit.removeUploadingRef}
				onReturnFocus={NO_FOCUS_RETURN}
				text={edit.entries.join("\n")}
			/>
			<ScreenshotRemoveDialog
				groupLabel={groupLabel}
				onCancel={removal.cancel}
				onConfirm={removal.confirm}
				open={removal.open}
			/>
		</>
	);
}
