import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { CaseAttachmentContextValue } from "@/components/cases/case-attachment-context";
import { precheckCaseImage } from "@/components/cases/case-attachment-policy";
import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import {
	CASE_FALLBACK_FILE_NAME,
	type CaseImageUpload,
	isStorageUnavailableError,
} from "@/components/cases/use-case-attachment-upload";
import { useCasePasteUpload } from "@/components/cases/use-case-paste-upload";
import { client, orpc } from "@/utils/orpc";

const PLACEHOLDER_CASE_ID = "00000000-0000-0000-0000-000000000000";

const NO_ATTACHMENTS: readonly CaseDraftAttachment[] = [];

type DraftUploadOutcome =
	| { attachment: CaseDraftAttachment; kind: "ok" }
	| { kind: "rejected" }
	| { kind: "storage-unavailable" };

interface DraftScope {
	caseId: string;
	projectId: string;
}

async function uploadDraftOne(
	scope: DraftScope,
	file: File
): Promise<DraftUploadOutcome> {
	const displayName = file.name || CASE_FALLBACK_FILE_NAME;
	const precheck = precheckCaseImage(file);
	if (!precheck.ok) {
		toast.error(`${displayName}：${precheck.reason}`);
		return { kind: "rejected" };
	}
	const contentType = file.type;
	try {
		const { attachmentId, storageKey, uploadUrl } =
			await client.caseAttachments.presignDraftUpload({
				caseId: scope.caseId,
				contentType,
				fileName: displayName,
				projectId: scope.projectId,
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
		return {
			attachment: { fileName: displayName, id: attachmentId, storageKey },
			kind: "ok",
		};
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

function useDraftUploader(
	scope: DraftScope | null,
	onUploaded: (attachment: CaseDraftAttachment) => void
): CaseImageUpload {
	const status = useQuery(orpc.caseAttachments.storageStatus.queryOptions({}));
	const [storageFailed, setStorageFailed] = useState(false);
	const [uploading, setUploading] = useState(false);

	const upload = useCallback(
		async (files: readonly File[]): Promise<string[]> => {
			if (scope === null) {
				return [];
			}
			const ids: string[] = [];
			setUploading(true);
			try {
				for (const file of files) {
					// biome-ignore lint/performance/noAwaitInLoops: 串行是刻意的，理由与 use-case-attachment-upload.ts 里那条相同——预签名只有 5 分钟有效期，并发抢上行带宽会把每一个都拖到过期
					const outcome = await uploadDraftOne(scope, file);
					if (outcome.kind === "storage-unavailable") {
						setStorageFailed(true);
						toast.error("附件存储（R2）未配置，无法粘贴图片");
						break;
					}
					if (outcome.kind === "ok") {
						onUploaded(outcome.attachment);
						ids.push(outcome.attachment.id);
					}
				}
			} finally {
				setUploading(false);
			}
			return ids;
		},
		[onUploaded, scope]
	);

	return {
		storageUnavailable: status.data?.configured === false || storageFailed,
		upload,
		uploading,
	};
}

function useRestoredImageUrls(
	scope: DraftScope | null,
	restored: readonly CaseDraftAttachment[]
): ReadonlyMap<string, string | null> {
	const storageKeys = useMemo(
		() => restored.map((item) => item.storageKey),
		[restored]
	);
	const query = useQuery(
		orpc.caseAttachments.presignDraftDownload.queryOptions({
			enabled: scope !== null && storageKeys.length > 0,
			input: {
				caseId: scope?.caseId ?? PLACEHOLDER_CASE_ID,
				projectId: scope?.projectId ?? PLACEHOLDER_CASE_ID,
				storageKeys,
			},
		})
	);
	const signed = query.data;

	return useMemo(() => {
		const urls = new Map<string, string | null>();
		if (signed === undefined) {
			return urls;
		}
		const byKey = new Map(signed.map((item) => [item.storageKey, item.url]));
		for (const item of restored) {
			urls.set(item.id, byKey.get(item.storageKey) ?? null);
		}
		return urls;
	}, [restored, signed]);
}

export interface CaseDraftAttachments extends CaseAttachmentContextValue {
	pending: readonly CaseDraftAttachment[];
}

export interface CaseDraftAttachmentsOptions {
	caseId: string | null;
	projectId: string;
	restored: readonly CaseDraftAttachment[];
}

export function useCaseDraftAttachments(
	options: CaseDraftAttachmentsOptions
): CaseDraftAttachments {
	const { caseId, projectId, restored } = options;
	const scope = useMemo(
		() => (caseId === null ? null : { caseId, projectId }),
		[caseId, projectId]
	);
	const [pending, setPending] =
		useState<readonly CaseDraftAttachment[]>(NO_ATTACHMENTS);

	useEffect(() => {
		setPending(restored);
	}, [restored]);

	const handleUploaded = useCallback((attachment: CaseDraftAttachment) => {
		setPending((prev) => [...prev, attachment]);
	}, []);

	const uploader = useDraftUploader(scope, handleUploaded);
	const serverUrls = useRestoredImageUrls(scope, restored);
	const { imageUrls, uploading, uploadPasted } = useCasePasteUpload(
		uploader,
		serverUrls
	);

	return useMemo(
		() => ({ imageUrls, pending, uploading, uploadPasted }),
		[imageUrls, pending, uploading, uploadPasted]
	);
}
