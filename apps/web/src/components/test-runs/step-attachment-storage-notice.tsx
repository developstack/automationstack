import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import { useRunStepAttachments } from "@/components/test-runs/run-step-attachments-context";

/** 编辑中但是附件存储不可用时，在步骤上方提示一次，不在每个步骤中重复。 */
export function StepAttachmentStorageNotice() {
	const { storageUnavailable } = useRunStepAttachments();
	if (!storageUnavailable) {
		return null;
	}
	return (
		<p className={`rounded-md border border-dashed p-3 ${RUN_SECTION_TEXT}`}>
			附件存储暂时不可用，不能上传实际附件。判定与实际结果的文字都不受影响，
			请让管理员检查「存储设置」，然后再补传。
		</p>
	);
}
