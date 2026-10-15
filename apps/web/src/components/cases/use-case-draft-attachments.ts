import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CaseAttachmentContextValue } from "@/components/cases/case-attachment-context";
import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import {
	type CaseImageUpload,
	type CaseImageUploadResult,
	type CaseUploadProgress,
	caseUploadFailure,
	putCaseImage,
	useStorageAvailability,
} from "@/components/cases/use-case-attachment-upload";
import { useCasePasteUpload } from "@/components/cases/use-case-paste-upload";
import {
	type StepScreenshotStore,
	useStepScreenshots,
} from "@/components/cases/use-step-screenshots";
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
	onProgress: CaseUploadProgress,
	onUploaded: (attachment: CaseDraftAttachment) => void
): Promise<CaseImageUploadResult> {
	try {
		const { fileName, presigned } = await putCaseImage(
			file,
			onProgress,
			(name) =>
				client.caseAttachments.presignDraftUpload({
					caseId: scope.caseId,
					contentType: file.type,
					fileName: name,
					projectId: scope.projectId,
					sizeBytes: file.size,
				})
		);
		const { attachmentId: id, storageKey } = presigned;
		const draft = { fileName, id, storageKey };
		onUploaded(draft);
		return { attachmentId: id, draft, kind: "ok" };
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
			onProgress: CaseUploadProgress
		): Promise<CaseImageUploadResult> => {
			if (scope === null) {
				return NO_SCOPE_RESULT;
			}
			const result = await uploadDraftOne(scope, file, onProgress, onUploaded);
			if (result.kind === "storage-unavailable") {
				markUnavailable();
			}
			return result;
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
	screenshots: StepScreenshotStore;
}

const IGNORE_UPLOADED = (): void => undefined;

const NO_FILE_NAMES: ReadonlyMap<string, string> = new Map();

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
	// 步骤截图不随草稿保存，所以上传后不加入草稿的附件列表
	const screenshotUploader = useDraftUploader(scope, IGNORE_UPLOADED);
	const screenshots = useStepScreenshots(screenshotUploader);
	const serverUrls = useRestoredImageUrls(scope, restored);
	const paste = useCasePasteUpload(uploader, serverUrls);

	return useMemo(
		() => ({ ...paste, fileNames: NO_FILE_NAMES, pending, screenshots }),
		[paste, pending, screenshots]
	);
}
