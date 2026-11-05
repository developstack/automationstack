import { MAX_STEP_ATTACHMENTS } from "@automationstack/db/repositories/test-run-step-attachments-core";

import type { MediaItem, MediaKind } from "@/components/media/media-item";

/** testRunAttachments.list 返回的一个附件。stepId 为 null 表示附件挂在整条用例上。 */
export interface RunAttachmentView {
	attachment: {
		contentType: string;
		fileName: string;
		id: string;
		sizeBytes: number;
		stepId: string | null;
	};
	url: string | null;
}

/** 一个上传中的实际附件，还没有登记。 */
export interface PendingStepUpload {
	id: string;
	kind: MediaKind;
	name: string;
	stepId: string;
}

export function mediaKindOf(contentType: string): MediaKind {
	return contentType.startsWith("video/") ? "video" : "image";
}

/** 一个步骤的实际附件：已登记的按上传顺序，后面是上传中的。 */
export function stepAttachmentItems(
	list: readonly RunAttachmentView[],
	stepId: string,
	pending: readonly PendingStepUpload[]
): MediaItem[] {
	const saved: MediaItem[] = list
		.filter((item) => item.attachment.stepId === stepId)
		.map(({ attachment, url }) => ({
			id: attachment.id,
			kind: mediaKindOf(attachment.contentType),
			name: attachment.fileName,
			url,
		}));
	const uploading: MediaItem[] = pending
		.filter((upload) => upload.stepId === stepId)
		.map((upload) => ({
			id: upload.id,
			kind: upload.kind,
			name: upload.name,
			status: "uploading",
			url: null,
		}));
	return [...saved, ...uploading];
}

/**
 * 不属于当前任何步骤的附件，只读：整条用例的附件（自动化上传的和以前人工上传的），
 * 以及后来从用例中删除的步骤的实际附件。stepIds 是用例当前的步骤。
 */
export function caseLevelAttachments<T extends RunAttachmentView>(
	list: readonly T[],
	stepIds: readonly string[]
): T[] {
	return list.filter(
		({ attachment }) =>
			attachment.stepId === null || !stepIds.includes(attachment.stepId)
	);
}

/** 一个步骤最多 MAX_STEP_ATTACHMENTS 个实际附件：existing 是这个步骤已有的数量（包括上传中的）。 */
export function takeUploadable(
	files: readonly File[],
	existing: number
): { accepted: File[]; skipped: number } {
	const room = Math.max(0, MAX_STEP_ATTACHMENTS - existing);
	const accepted = files.slice(0, room);
	return { accepted, skipped: files.length - accepted.length };
}
