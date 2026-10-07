import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { useCaseImageUpload } from "@/components/cases/use-case-attachment-upload";
import {
	type CasePasteTarget,
	useCasePasteUpload,
} from "@/components/cases/use-case-paste-upload";
import { orpc } from "@/utils/orpc";

export interface CaseAttachmentContextValue {
	imageUrls: ReadonlyMap<string, string | null>;
	uploading: boolean;
	uploadPasted: ((files: File[], target: CasePasteTarget) => void) | null;
}

const NO_ATTACHMENTS: CaseAttachmentContextValue = {
	imageUrls: new Map(),
	uploading: false,
	uploadPasted: null,
};

const CaseAttachmentContext =
	createContext<CaseAttachmentContextValue>(NO_ATTACHMENTS);

export function useCaseAttachments(): CaseAttachmentContextValue {
	return useContext(CaseAttachmentContext);
}

export function useCaseAttachmentUrls(
	caseId: string
): ReadonlyMap<string, string | null> {
	const query = useQuery(
		orpc.caseAttachments.list.queryOptions({ input: { caseId } })
	);
	const items = query.data;
	return useMemo(
		() => new Map((items ?? []).map((item) => [item.attachment.id, item.url])),
		[items]
	);
}

export function useCaseEditAttachments(
	caseId: string
): CaseAttachmentContextValue {
	const serverUrls = useCaseAttachmentUrls(caseId);
	const uploader = useCaseImageUpload(caseId);
	const { imageUrls, uploading, uploadPasted } = useCasePasteUpload(
		uploader,
		serverUrls
	);
	return useMemo<CaseAttachmentContextValue>(
		() => ({ imageUrls, uploading, uploadPasted }),
		[imageUrls, uploading, uploadPasted]
	);
}

export function CaseAttachmentProvider({
	children,
	value,
}: {
	children: ReactNode;
	value: CaseAttachmentContextValue;
}) {
	return (
		<CaseAttachmentContext value={value}>{children}</CaseAttachmentContext>
	);
}
