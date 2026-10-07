import { useCallback } from "react";

import { AttachmentList } from "@/components/test-runs/attachment-list";
import { AttachmentDropZone } from "@/components/test-runs/run-attachment-dropzone";
import {
	AttachmentGallery,
	isViewableImage,
} from "@/components/test-runs/run-attachment-gallery";
import { useAttachmentPicker } from "@/components/test-runs/run-attachment-picker";
import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import {
	useAttachmentList,
	useRemoveAttachment,
	useUploadAttachments,
} from "@/components/test-runs/use-attachment-upload";

export interface RunAttachmentsProps {
	editing: boolean;
	onStorageUnavailable: () => void;
	runCaseId: string;
	storageUnavailable: boolean;
}

export function RunAttachments({
	editing,
	onStorageUnavailable,
	runCaseId,
	storageUnavailable,
}: RunAttachmentsProps) {
	const listQuery = useAttachmentList(runCaseId);
	const upload = useUploadAttachments({ onStorageUnavailable, runCaseId });
	const remove = useRemoveAttachment(onStorageUnavailable);

	const canUpload = editing && !storageUnavailable;
	const picker = useAttachmentPicker({ canUpload, upload });
	const handleRemove = useCallback(
		(attachmentId: string) => remove.mutate({ attachmentId }),
		[remove]
	);

	const items = listQuery.data ?? [];
	if (!(editing || items.length > 0)) {
		return null;
	}

	const images = items.filter(isViewableImage);
	const files = items.filter((item) => !isViewableImage(item));

	return (
		<div className="flex flex-col gap-2">
			{canUpload ? (
				<AttachmentDropZone picker={picker} uploading={upload.isPending} />
			) : null}
			{editing && storageUnavailable ? (
				<p
					className={`rounded-md border border-dashed p-3 ${RUN_SECTION_TEXT}`}
				>
					附件存储（R2）未配置，暂时无法上传附件。结论、说明与缺陷关联都不受影响，
					可以让管理员在服务端补上 R2 配置后再补传。
				</p>
			) : null}
			<AttachmentGallery
				items={images}
				onRemove={handleRemove}
				removable={editing}
			/>
			<AttachmentList
				items={files}
				onRemove={handleRemove}
				removable={editing}
			/>
		</div>
	);
}
