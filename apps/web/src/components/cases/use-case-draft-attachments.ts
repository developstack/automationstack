import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CaseAttachmentContextValue } from "@/components/cases/case-attachment-context";
import { precheckCaseImage } from "@/components/cases/case-attachment-policy";
import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import { putFileToStorage } from "@/components/cases/case-storage-put";
import {
	CASE_FALLBACK_FILE_NAME,
	type CaseImageUpload,
	type CaseImageUploadResult,
	caseUploadFailure,
	useStorageAvailability,
} from "@/components/cases/use-case-attachment-upload";
import { useCasePasteUpload } from "@/components/cases/use-case-paste-upload";
import { client, orpc } from "@/utils/orpc";

const PLACEHOLDER_CASE_ID = "00000000-0000-0000-0000-000000000000";

const NO_ATTACHMENTS: readonly CaseDraftAttachment[] = [];

interface DraftScope {
	caseId: string;
	projectId: string;
}

async function uploadDraftOne(
	scope: DraftScope,
	file: File,
	onProgress: (fraction: number) => void
): Promise<{ attachment: CaseDraftAttachment } | CaseImageUploadResult> {
	const precheck = precheckCaseImage(file);
	if (!precheck.ok) {
		return { kind: "failed", reason: precheck.reason };
	}
	const fileName = file.name || CASE_FALLBACK_FILE_NAME;
	try {
		const { attachmentId, storageKey, uploadUrl } =
			await client.caseAttachments.presignDraftUpload({
				caseId: scope.caseId,
				contentType: file.type,
				fileName,
				projectId: scope.projectId,
				sizeBytes: file.size,
			});
		await putFileToStorage({
			contentType: file.type,
			file,
			onProgress,
			url: uploadUrl,
		});
		return { attachment: { fileName, id: attachmentId, storageKey } };
	} catch (error) {
		return caseUploadFailure(error);
	}
}

const NO_SCOPE_RESULT: CaseImageUploadResult = {
	kind: "failed",
	reason: "用例还没有准备好，请稍后重试",
};

function useDraftUploader(
	scope: DraftScope | null,
	onUploaded: (attachment: CaseDraftAttachment) => void
): CaseImageUpload {
	const { markUnavailable, storageUnavailable } = useStorageAvailability();

	const upload = useCallback(
		async (
			file: File,
			onProgress: (fraction: number) => void
		): Promise<CaseImageUploadResult> => {
			if (scope === null) {
				return NO_SCOPE_RESULT;
			}
			const outcome = await uploadDraftOne(scope, file, onProgress);
			if (!("attachment" in outcome)) {
				if (outcome.kind === "storage-unavailable") {
					markUnavailable();
				}
				return outcome;
			}
			onUploaded(outcome.attachment);
			return { attachmentId: outcome.attachment.id, kind: "ok" };
		},
		[markUnavailable, onUploaded, scope]
	);

	return { storageUnavailable, upload };
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
	const paste = useCasePasteUpload(uploader, serverUrls);

	return useMemo(() => ({ ...paste, pending }), [paste, pending]);
}
