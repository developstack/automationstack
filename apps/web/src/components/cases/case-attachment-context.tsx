import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { useCaseImageUpload } from "@/components/cases/use-case-attachment-upload";
import {
	type CasePasteUpload,
	useCasePasteUpload,
} from "@/components/cases/use-case-paste-upload";
import { orpc } from "@/utils/orpc";

/** 用例正文中的图片：可以显示的地址、粘贴图片的上传任务，以及重试和移除失败的上传。 */
export type CaseAttachmentContextValue = CasePasteUpload;

const NO_ATTACHMENTS: CaseAttachmentContextValue = {
	discardUpload: () => undefined,
	imageUrls: new Map(),
	retryUpload: () => undefined,
	uploading: false,
	uploadPasted: null,
	uploads: new Map(),
};

const CaseAttachmentContext =
	createContext<CaseAttachmentContextValue>(NO_ATTACHMENTS);

export function useCaseAttachments(): CaseAttachmentContextValue {
	return useContext(CaseAttachmentContext);
}

function useCaseAttachmentList(caseId: string) {
	const query = useQuery(
		orpc.caseAttachments.list.queryOptions({ input: { caseId } })
	);
	return query.data;
}

export function useCaseAttachmentUrls(
	caseId: string
): ReadonlyMap<string, string | null> {
	const items = useCaseAttachmentList(caseId);
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
	return useCasePasteUpload(uploader, serverUrls);
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
