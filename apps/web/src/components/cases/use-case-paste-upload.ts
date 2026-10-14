import { useEffect, useMemo } from "react";
import type { CaseImageUpload } from "@/components/cases/use-case-attachment-upload";
import {
	type CasePasteTarget,
	useCaseUploadCommands,
} from "@/components/cases/use-case-upload-commands";
import {
	type CaseUploadJobs,
	hasActiveCaseUploads,
	useCaseUploadJobs,
} from "@/components/cases/use-case-upload-jobs";
import {
	type LocalUrlActions,
	useLocalImageUrls,
} from "@/components/cases/use-local-image-urls";

function useMergedImageUrls(
	serverUrls: ReadonlyMap<string, string | null>,
	localUrls: ReadonlyMap<string, string>,
	actions: LocalUrlActions
): ReadonlyMap<string, string | null> {
	useEffect(() => {
		for (const key of localUrls.keys()) {
			if ((serverUrls.get(key) ?? null) !== null) {
				actions.release(key);
			}
		}
	}, [actions, serverUrls, localUrls]);

	return useMemo<ReadonlyMap<string, string | null>>(() => {
		if (localUrls.size === 0) {
			return serverUrls;
		}
		const merged = new Map(serverUrls);
		for (const [key, url] of localUrls) {
			if ((merged.get(key) ?? null) === null) {
				merged.set(key, url);
			}
		}
		return merged;
	}, [serverUrls, localUrls]);
}

export interface CasePasteUpload {
	discardUpload: (token: string) => void;
	imageUrls: ReadonlyMap<string, string | null>;
	retryUpload: (token: string) => void;
	uploading: boolean;
	uploadPasted: ((files: File[], target: CasePasteTarget) => void) | null;
	uploads: CaseUploadJobs;
}

export function useCasePasteUpload(
	uploader: CaseImageUpload,
	serverUrls: ReadonlyMap<string, string | null>
): CasePasteUpload {
	const { actions, urls } = useLocalImageUrls();
	const { actions: jobActions, jobs } = useCaseUploadJobs();
	const { storageUnavailable, upload } = uploader;
	const imageUrls = useMergedImageUrls(serverUrls, urls, actions);
	const { discardUpload, retryUpload, uploadPasted } = useCaseUploadCommands(
		upload,
		actions,
		jobActions
	);
	const uploading = hasActiveCaseUploads(jobs);

	return useMemo(
		() => ({
			discardUpload,
			imageUrls,
			retryUpload,
			uploading,
			uploadPasted: storageUnavailable ? null : uploadPasted,
			uploads: jobs,
		}),
		[
			discardUpload,
			imageUrls,
			jobs,
			retryUpload,
			storageUnavailable,
			uploading,
			uploadPasted,
		]
	);
}
