import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import { useRunStepAttachments } from "@/components/test-runs/run-step-attachments-context";

/** 编辑中但是附件存储（R2）不可用时，在步骤上方提示一次，不在每个步骤中重复。 */
export function StepAttachmentStorageNotice() {
	const { storageUnavailable } = useRunStepAttachments();
	if (!storageUnavailable) {
		return null;
	}
	return (
		<p className={`rounded-md border border-dashed p-3 ${RUN_SECTION_TEXT}`}>
			附件存储（R2）未配置，暂时无法上传实际附件。判定、实际结果的文字与缺陷关联都不受影响，
			可以让管理员在服务端补上 R2 配置后再补传。
		</p>
	);
}
