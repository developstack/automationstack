import { actualResultRequired } from "@automationstack/db/repositories/test-run-step-results-core";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import { cn } from "@automationstack/ui/lib/utils";
import { useCallback } from "react";

import { RUN_STEP_COLUMN_TITLE } from "@/components/test-runs/run-panel-typography";
import { useStepAttachments } from "@/components/test-runs/run-step-attachments-context";
import { StepActualAttachments } from "@/components/test-runs/step-actual-attachments";
import { StepActualResultText } from "@/components/test-runs/step-actual-result-text";
import { useStepAttachmentDrop } from "@/components/test-runs/use-step-attachment-drop";

interface StepActualResultFieldProps {
	editing: boolean;
	onChange: (stepId: string, text: string) => void;
	/** 步骤的序号（从 1 开始），用于实际附件的名称。 */
	position: number;
	result: TestRunStepResult | undefined;
	stepId: string;
	value: string;
}

/**
 * 步骤卡片的「实际结果」一栏：文字和实际附件。编辑时是输入框，失败和阻塞时必填；
 * 没有判定的步骤不能填写文字，也不能添加实际附件，先提示选择判定。
 * 可以把文件拖入这一栏、粘贴到输入框，或点「+」选择文件。不编辑时（包括已提交和已作废）只读。
 */
export function StepActualResultField({
	editing,
	onChange,
	position,
	result,
	stepId,
	value,
}: StepActualResultFieldProps) {
	const judged = result !== undefined;
	const attachments = useStepAttachments(stepId, judged);
	const drop = useStepAttachmentDrop(attachments.canAdd, attachments.addFiles);
	const headingId = `run-step-actual-${stepId}`;
	const required = result !== undefined && actualResultRequired(result);
	const handleChange = useCallback(
		(text: string) => onChange(stepId, text),
		[onChange, stepId]
	);
	return (
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: 拖放区没有等价的可聚焦语义，键盘路径由「+」按钮承担
		<section
			aria-labelledby={headingId}
			className={cn(
				"flex min-w-0 flex-col gap-1.5 rounded-md",
				drop.dragging && "bg-accent ring-2 ring-primary"
			)}
			onDragLeave={drop.handleDragLeave}
			onDragOver={drop.handleDragOver}
			onDrop={drop.handleDrop}
		>
			<div className="flex items-baseline gap-1.5">
				<h4 className={RUN_STEP_COLUMN_TITLE} id={headingId}>
					实际结果
				</h4>
				{editing && required ? (
					<span className="text-destructive text-xs">必填</span>
				) : null}
			</div>
			<StepActualResultText
				editing={editing}
				headingId={headingId}
				judged={judged}
				onChange={handleChange}
				onPaste={drop.handlePaste}
				required={required}
				value={value}
			/>
			<StepActualAttachments attachments={attachments} position={position} />
		</section>
	);
}
