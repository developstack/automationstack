import { ORPCError } from "@orpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { precheckCaseImage } from "@/components/cases/case-attachment-policy";
import { putFileToStorage } from "@/components/cases/case-storage-put";
import { client, orpc } from "@/utils/orpc";

export const CASE_FALLBACK_FILE_NAME = "粘贴的图片";

const MAX_FILES_PER_BATCH = 10;

export function isStorageUnavailableError(error: unknown): boolean {
	return error instanceof ORPCError && error.code === "PRECONDITION_FAILED";
}

/** 一张图片的上传结果。failed 的原因可以直接显示给用户。 */
export type CaseImageUploadResult =
	| { attachmentId: string; kind: "ok" }
	| { kind: "failed"; reason: string }
	| { kind: "storage-unavailable" };

export interface CaseImageUpload {
	storageUnavailable: boolean;
	/** 上传一张图片。onProgress 报告已发送的比例，0 到 1。 */
	upload: (
		file: File,
		onProgress: (fraction: number) => void
	) => Promise<CaseImageUploadResult>;
}

/** 把上传中抛出的错误转换为结果：附件存储未配置时单独返回，其他错误给出原因。 */
export function caseUploadFailure(error: unknown): CaseImageUploadResult {
	if (isStorageUnavailableError(error)) {
		return { kind: "storage-unavailable" };
	}
	return {
		kind: "failed",
		reason: error instanceof Error ? error.message : "上传失败",
	};
}

/** 附件存储未配置时只提示一次，并停止接受粘贴的图片。 */
export function useStorageAvailability() {
	const status = useQuery(orpc.caseAttachments.storageStatus.queryOptions({}));
	const [storageFailed, setStorageFailed] = useState(false);
	const markUnavailable = useCallback(() => {
		setStorageFailed(true);
		toast.error("附件存储（R2）未配置，无法粘贴图片");
	}, []);
	return {
		markUnavailable,
		storageUnavailable: status.data?.configured === false || storageFailed,
	};
}

async function uploadOne(
	caseId: string,
	file: File,
	onProgress: (fraction: number) => void
): Promise<CaseImageUploadResult> {
	const precheck = precheckCaseImage(file);
	if (!precheck.ok) {
		return { kind: "failed", reason: precheck.reason };
	}
	const fileName = file.name || CASE_FALLBACK_FILE_NAME;
	try {
		const { storageKey, uploadUrl } =
			await client.caseAttachments.presignUpload({
				caseId,
				contentType: file.type,
				fileName,
				sizeBytes: file.size,
			});
		await putFileToStorage({
			contentType: file.type,
			file,
			onProgress,
			url: uploadUrl,
		});
		const attachment = await client.caseAttachments.register({
			caseId,
			fileName,
			storageKey,
		});
		return { attachmentId: attachment.id, kind: "ok" };
	} catch (error) {
		return caseUploadFailure(error);
	}
}

export function useCaseImageUpload(caseId: string): CaseImageUpload {
	const queryClient = useQueryClient();
	const { markUnavailable, storageUnavailable } = useStorageAvailability();

	const upload = useCallback(
		async (
			file: File,
			onProgress: (fraction: number) => void
		): Promise<CaseImageUploadResult> => {
			const result = await uploadOne(caseId, file, onProgress);
			if (result.kind === "storage-unavailable") {
				markUnavailable();
			}
			if (result.kind === "ok") {
				queryClient.invalidateQueries({
					queryKey: orpc.caseAttachments.key(),
				});
			}
			return result;
		},
		[caseId, markUnavailable, queryClient]
	);

	return { storageUnavailable, upload };
}

export const CASE_IMAGE_BATCH_LIMIT = MAX_FILES_PER_BATCH;
