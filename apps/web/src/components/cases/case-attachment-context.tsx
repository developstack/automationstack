import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { useCaseImageUpload } from "@/components/cases/use-case-attachment-upload";
import {
	type CasePasteUpload,
	useCasePasteUpload,
} from "@/components/cases/use-case-paste-upload";
import {
	type StepScreenshotStore,
	useStepScreenshots,
} from "@/components/cases/use-step-screenshots";
import { orpc } from "@/utils/orpc";

/**
 * 用例正文中的图片：可以显示的地址、粘贴图片的上传任务，以及重试和移除失败的上传。
 * 编辑区还有步骤截图：还没有保存的截图只在浏览器内存中，保存时上传。
 */
export interface CaseAttachmentContextValue extends CasePasteUpload {
	/** 已登记的附件 id 到文件名。 */
	fileNames: ReadonlyMap<string, string>;
	/** 编辑区的步骤截图。只读的页面没有，为 null。 */
	screenshots: StepScreenshotStore | null;
}

const NO_ATTACHMENTS: CaseAttachmentContextValue = {
	discardUpload: () => undefined,
	fileNames: new Map(),
	imageUrls: new Map(),
	retryUpload: () => undefined,
	screenshots: null,
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

function useCaseAttachmentFileNames(
	caseId: string
): ReadonlyMap<string, string> {
	const items = useCaseAttachmentList(caseId);
	return useMemo(
		() =>
			new Map(
				(items ?? []).map((item) => [
					item.attachment.id,
					item.attachment.fileName,
				])
			),
		[items]
	);
}

export function useCaseEditAttachments(
	caseId: string
): CaseAttachmentContextValue & { screenshots: StepScreenshotStore } {
	const serverUrls = useCaseAttachmentUrls(caseId);
	const fileNames = useCaseAttachmentFileNames(caseId);
	const uploader = useCaseImageUpload(caseId);
	const screenshots = useStepScreenshots(uploader);
	const paste = useCasePasteUpload(uploader, serverUrls);
	return useMemo(
		() => ({ ...paste, fileNames, screenshots }),
		[fileNames, paste, screenshots]
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
