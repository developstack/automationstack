import { ORPCError } from "@orpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { precheckCaseImage } from "@/components/cases/case-attachment-policy";
import { client, orpc } from "@/utils/orpc";

export const CASE_FALLBACK_FILE_NAME = "粘贴的图片";

const MAX_FILES_PER_BATCH = 10;

export function isStorageUnavailableError(error: unknown): boolean {
	return error instanceof ORPCError && error.code === "PRECONDITION_FAILED";
}

type UploadOutcome =
	| { attachmentId: string; kind: "ok" }
	| { kind: "rejected" }
	| { kind: "storage-unavailable" };

async function uploadOne(caseId: string, file: File): Promise<UploadOutcome> {
	const displayName = file.name || CASE_FALLBACK_FILE_NAME;
	const precheck = precheckCaseImage(file);
	if (!precheck.ok) {
		toast.error(`${displayName}：${precheck.reason}`);
		return { kind: "rejected" };
	}
	const contentType = file.type;
	try {
		const { storageKey, uploadUrl } =
			await client.caseAttachments.presignUpload({
				caseId,
				contentType,
				fileName: displayName,
				sizeBytes: file.size,
			});
		const response = await fetch(uploadUrl, {
			body: file,
			headers: { "Content-Type": contentType },
			method: "PUT",
		});
		if (!response.ok) {
			throw new Error(`上传到存储失败（HTTP ${response.status}）`);
		}
		const attachment = await client.caseAttachments.register({
			caseId,
			fileName: displayName,
			storageKey,
		});
		return { attachmentId: attachment.id, kind: "ok" };
	} catch (error) {
		if (isStorageUnavailableError(error)) {
			return { kind: "storage-unavailable" };
		}
		toast.error(
			`${displayName}：${error instanceof Error ? error.message : "上传失败"}`
		);
		return { kind: "rejected" };
	}
}

export interface CaseImageUpload {
	storageUnavailable: boolean;
	upload: (files: readonly File[]) => Promise<string[]>;
	uploading: boolean;
}

export function useCaseImageUpload(caseId: string): CaseImageUpload {
	const queryClient = useQueryClient();
	const status = useQuery(orpc.caseAttachments.storageStatus.queryOptions({}));
	const [storageFailed, setStorageFailed] = useState(false);
	const [uploading, setUploading] = useState(false);

	const upload = useCallback(
		async (files: readonly File[]): Promise<string[]> => {
			const ids: string[] = [];
			setUploading(true);
			try {
				for (const file of files.slice(0, MAX_FILES_PER_BATCH)) {
					// biome-ignore lint/performance/noAwaitInLoops: 串行是刻意的——预签名只有 5 分钟有效期，十个 PUT 同时抢上行带宽会把每一个都拖到过期；而且串行才能让「第 3 张超限」这类提示按顺序出现
					const outcome = await uploadOne(caseId, file);
					if (outcome.kind === "storage-unavailable") {
						setStorageFailed(true);
						toast.error("附件存储（R2）未配置，无法粘贴图片");
						break;
					}
					if (outcome.kind === "ok") {
						ids.push(outcome.attachmentId);
					}
				}
			} finally {
				setUploading(false);
			}
			if (ids.length > 0) {
				queryClient.invalidateQueries({
					queryKey: orpc.caseAttachments.key(),
				});
			}
			return ids;
		},
		[caseId, queryClient]
	);

	return {
		storageUnavailable: status.data?.configured === false || storageFailed,
		upload,
		uploading,
	};
}

export const CASE_IMAGE_BATCH_LIMIT = MAX_FILES_PER_BATCH;
