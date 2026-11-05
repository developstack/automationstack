import { MAX_STEP_ATTACHMENTS } from "@automationstack/db/repositories/test-run-step-attachments-core";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";
import { toast } from "sonner";

import type { MediaItem } from "@/components/media/media-item";
import { precheckAttachment } from "@/components/test-runs/attachment-policy";
import {
	type PendingStepUpload,
	type RunAttachmentView,
	stepAttachmentItems,
	takeUploadable,
} from "@/components/test-runs/run-step-attachment-items";
import {
	type StepUploadBatch,
	useAttachmentList,
	usePendingStepUploads,
	useRemoveAttachment,
	useUploadStepAttachments,
} from "@/components/test-runs/use-attachment-upload";

/** 一条用例在执行页中的实际附件：全部附件、上传中的文件，以及上传和删除。 */
export interface RunStepAttachmentsValue {
	/** 编辑中并且存储可用时，可以上传和删除实际附件。已提交和已作废的测试任务不能编辑。 */
	canEdit: boolean;
	list: readonly RunAttachmentView[];
	pending: readonly PendingStepUpload[];
	remove: (attachmentId: string) => void;
	/** 编辑中但是附件存储不可用。 */
	storageUnavailable: boolean;
	upload: (batch: StepUploadBatch) => void;
}

const NOTHING = (): void => undefined;

const READ_ONLY: RunStepAttachmentsValue = {
	canEdit: false,
	list: [],
	pending: [],
	remove: NOTHING,
	storageUnavailable: false,
	upload: NOTHING,
};

const RunStepAttachmentsContext =
	createContext<RunStepAttachmentsValue>(READ_ONLY);

export interface RunStepAttachmentsOptions {
	editing: boolean;
	onStorageUnavailable: () => void;
	runCaseId: string;
	storageUnavailable: boolean;
}

export function useRunStepAttachmentsValue({
	editing,
	onStorageUnavailable,
	runCaseId,
	storageUnavailable,
}: RunStepAttachmentsOptions): RunStepAttachmentsValue {
	const listQuery = useAttachmentList(runCaseId);
	const pending = usePendingStepUploads(runCaseId);
	const { mutate: upload } = useUploadStepAttachments({
		onStorageUnavailable,
		runCaseId,
	});
	const { mutate: removeMutate } = useRemoveAttachment(onStorageUnavailable);
	const remove = useCallback(
		(attachmentId: string) => removeMutate({ attachmentId }),
		[removeMutate]
	);
	const list = listQuery.data ?? READ_ONLY.list;
	return useMemo(
		() => ({
			canEdit: editing && !storageUnavailable,
			list,
			pending,
			remove,
			storageUnavailable: editing && storageUnavailable,
			upload,
		}),
		[editing, list, pending, remove, storageUnavailable, upload]
	);
}

export function useRunStepAttachments(): RunStepAttachmentsValue {
	return useContext(RunStepAttachmentsContext);
}

export interface StepAttachments {
	addFiles: (files: readonly File[]) => void;
	/** 可以再添加实际附件：编辑中、存储可用、步骤已有判定，并且没有达到上限。 */
	canAdd: boolean;
	canRemove: boolean;
	items: MediaItem[];
	remove: (attachmentId: string) => void;
}

/** 格式或大小不符合的文件不上传，逐个提示原因；它们也不占实际附件的名额。 */
function keepUploadable(files: readonly File[]): File[] {
	return files.filter((file) => {
		const precheck = precheckAttachment(file);
		if (!precheck.ok) {
			toast.error(`${file.name}：${precheck.message}`);
		}
		return precheck.ok;
	});
}

/**
 * 一个步骤的实际附件。超过上限的文件不上传，并提示没有上传的数量。
 * 没有判定的步骤不能保存实际结果，所以 judged 为 false 时不能添加；已有的实际附件仍然可以删除。
 */
export function useStepAttachments(
	stepId: string,
	judged: boolean
): StepAttachments {
	const { canEdit, list, pending, remove, upload } = useRunStepAttachments();
	const canUpload = canEdit && judged;
	const items = useMemo(
		() => stepAttachmentItems(list, stepId, pending),
		[list, pending, stepId]
	);
	const count = items.length;
	const addFiles = useCallback(
		(files: readonly File[]) => {
			if (!canUpload || files.length === 0) {
				return;
			}
			const { accepted, skipped } = takeUploadable(
				keepUploadable(files),
				count
			);
			if (skipped > 0) {
				toast.error(
					`一个步骤最多 ${MAX_STEP_ATTACHMENTS} 个实际附件，${skipped} 个文件没有上传`
				);
			}
			if (accepted.length > 0) {
				upload({ files: accepted, stepId });
			}
		},
		[canUpload, count, stepId, upload]
	);
	return {
		addFiles,
		canAdd: canUpload && count < MAX_STEP_ATTACHMENTS,
		canRemove: canEdit,
		items,
		remove,
	};
}

export function RunStepAttachmentsProvider({
	children,
	value,
}: {
	children: ReactNode;
	value: RunStepAttachmentsValue;
}) {
	return (
		<RunStepAttachmentsContext value={value}>
			{children}
		</RunStepAttachmentsContext>
	);
}
