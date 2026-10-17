import { AttachmentList } from "@/components/test-runs/attachment-list";
import {
	AttachmentGallery,
	isViewableImage,
} from "@/components/test-runs/run-attachment-gallery";
import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import { caseLevelAttachments } from "@/components/test-runs/run-step-attachment-items";
import { useAttachmentList } from "@/components/test-runs/use-attachment-upload";

export interface RunAttachmentsProps {
	runCaseId: string;
	/** 用例当前步骤的 id。属于这些步骤的实际附件显示在步骤中，不在这里显示。 */
	stepIds: readonly string[];
}

/**
 * 不属于当前任何步骤的附件：自动化上传的附件、以前人工上传的整条用例的附件，以及已删除步骤的实际附件。
 * 只读，不能上传，也不能删除。当前步骤的实际附件显示在各个步骤的实际结果中。没有这样的附件时不显示。
 */
export function RunAttachments({ runCaseId, stepIds }: RunAttachmentsProps) {
	const listQuery = useAttachmentList(runCaseId);
	const items = caseLevelAttachments(listQuery.data ?? [], stepIds);
	if (items.length === 0) {
		return null;
	}
	const images = items.filter(isViewableImage);
	const files = items.filter((item) => !isViewableImage(item));
	return (
		<section aria-label="整条用例的附件" className="flex flex-col gap-2">
			<p className={RUN_SECTION_TEXT}>
				整条用例的附件（自动化上传、以前上传或已删除步骤的实际附件，只读）
			</p>
			<AttachmentGallery items={images} />
			<AttachmentList items={files} />
		</section>
	);
}
