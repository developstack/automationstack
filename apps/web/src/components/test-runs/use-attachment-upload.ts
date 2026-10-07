import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { precheckAttachment } from "@/components/test-runs/attachment-policy";
import { client, orpc } from "@/utils/orpc";

const FALLBACK_FILE_NAME = "粘贴的图片";

const MAX_FILES_PER_BATCH = 10;

export function useAttachmentStorageStatus() {
	return useQuery(orpc.testRunAttachments.storageStatus.queryOptions({}));
}

export function useAttachmentList(runCaseId: string | undefined) {
	return useQuery({
		...orpc.testRunAttachments.list.queryOptions({
			input: { runCaseId: runCaseId ?? "" },
		}),
		enabled: runCaseId !== undefined,
	});
}

function useInvalidateAttachments(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.testRunAttachments.key() });
	}, [queryClient]);
}

function isStorageUnavailableError(error: unknown): boolean {
	return error instanceof ORPCError && error.code === "PRECONDITION_FAILED";
}

async function uploadOne(file: File, runCaseId: string): Promise<void> {
	const precheck = precheckAttachment(file);
	if (!precheck.ok) {
		toast.error(`${file.name || FALLBACK_FILE_NAME}：${precheck.message}`);
		return;
	}
	const { contentType, kind } = precheck;
	const { storageKey, uploadUrl } =
		await client.testRunAttachments.presignUpload({
			contentType,
			kind,
			runCaseId,
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
	await client.testRunAttachments.register({
		fileName: file.name || FALLBACK_FILE_NAME,
		kind,
		runCaseId,
		storageKey,
	});
}

export interface UploadOptions {
	onStorageUnavailable: () => void;
	runCaseId: string;
}

export function useUploadAttachments({
	onStorageUnavailable,
	runCaseId,
}: UploadOptions) {
	const invalidate = useInvalidateAttachments();
	return useMutation({
		mutationFn: async (files: readonly File[]) => {
			for (const file of files.slice(0, MAX_FILES_PER_BATCH)) {
				// biome-ignore lint/performance/noAwaitInLoops: 串行是刻意的，理由见上方注释（预签名有效期 + 上行带宽）
				await uploadOne(file, runCaseId);
			}
			return files.length;
		},
		onError: (error) => {
			if (isStorageUnavailableError(error)) {
				onStorageUnavailable();
			}
		},
		onSuccess: () => {
			invalidate();
		},
	});
}

export function useRemoveAttachment(onStorageUnavailable: () => void) {
	const invalidate = useInvalidateAttachments();
	return useMutation(
		orpc.testRunAttachments.remove.mutationOptions({
			onError: (error) => {
				if (isStorageUnavailableError(error)) {
					onStorageUnavailable();
				}
			},
			onSuccess: () => {
				invalidate();
				toast.success("附件已删除");
			},
		})
	);
}

export const ATTACHMENT_BATCH_LIMIT = MAX_FILES_PER_BATCH;
