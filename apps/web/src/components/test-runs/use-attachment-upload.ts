import { ORPCError } from "@orpc/client";
import {
	useMutation,
	useMutationState,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { precheckAttachment } from "@/components/test-runs/attachment-policy";
import {
	mediaKindOf,
	type PendingStepUpload,
} from "@/components/test-runs/run-step-attachment-items";
import { client, orpc } from "@/utils/orpc";

const FALLBACK_FILE_NAME = "粘贴的图片";

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

function useInvalidateAttachments(): () => Promise<void> {
	const queryClient = useQueryClient();
	return useCallback(
		() =>
			queryClient.invalidateQueries({
				queryKey: orpc.testRunAttachments.key(),
			}),
		[queryClient]
	);
}

function isStorageUnavailableError(error: unknown): boolean {
	return error instanceof ORPCError && error.code === "PRECONDITION_FAILED";
}

/** 一个步骤的一次上传：这些文件都上传到这个步骤的实际附件。 */
export interface StepUploadBatch {
	files: readonly File[];
	stepId: string;
}

interface UploadTarget {
	runCaseId: string;
	stepId: string;
}

async function uploadOne(file: File, target: UploadTarget): Promise<void> {
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
			runCaseId: target.runCaseId,
			sizeBytes: file.size,
			stepId: target.stepId,
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
		runCaseId: target.runCaseId,
		stepId: target.stepId,
		storageKey,
	});
}

const stepUploadKey = (runCaseId: string) =>
	["testRunStepAttachmentUpload", runCaseId] as const;

export interface UploadOptions {
	onStorageUnavailable: () => void;
	runCaseId: string;
}

/** 上传实际附件：一个一个地上传（预签名地址有有效期，并行也会挤占上行带宽），全部完成后刷新列表。 */
export function useUploadStepAttachments({
	onStorageUnavailable,
	runCaseId,
}: UploadOptions) {
	const invalidate = useInvalidateAttachments();
	return useMutation({
		meta: { failureAction: "上传实际附件" },
		mutationFn: async ({ files, stepId }: StepUploadBatch) => {
			for (const file of files) {
				// biome-ignore lint/performance/noAwaitInLoops: 串行是刻意的，理由见上方注释（预签名有效期 + 上行带宽）
				await uploadOne(file, { runCaseId, stepId });
			}
			return files.length;
		},
		mutationKey: stepUploadKey(runCaseId),
		onError: (error) => {
			if (isStorageUnavailableError(error)) {
				onStorageUnavailable();
			}
		},
		// 等列表刷新完成再结束上传，这样上传中的缩略图直接换成已登记的，中间不会空一下
		onSettled: () => invalidate(),
	});
}

/** 这条用例所有步骤正在上传的文件。几个步骤可以同时上传，所以读取全部进行中的上传。 */
export function usePendingStepUploads(runCaseId: string): PendingStepUpload[] {
	const batches = useMutationState({
		filters: { mutationKey: stepUploadKey(runCaseId), status: "pending" },
		select: (mutation) => ({
			batch: mutation.state.variables as StepUploadBatch | undefined,
			mutationId: mutation.mutationId,
		}),
	});
	return useMemo(
		() =>
			batches.flatMap(({ batch, mutationId }) =>
				(batch?.files ?? []).map((file, index) => ({
					id: `uploading-${mutationId}-${index}`,
					kind: mediaKindOf(file.type),
					name: file.name || FALLBACK_FILE_NAME,
					stepId: batch?.stepId ?? "",
				}))
			),
		[batches]
	);
}

export function useRemoveAttachment(onStorageUnavailable: () => void) {
	const invalidate = useInvalidateAttachments();
	return useMutation(
		orpc.testRunAttachments.remove.mutationOptions({
			meta: { failureAction: "删除实际附件" },
			onError: (error) => {
				if (isStorageUnavailableError(error)) {
					onStorageUnavailable();
				}
			},
			onSuccess: () => {
				toast.success("实际附件已删除");
				return invalidate();
			},
		})
	);
}
