import { actualResultRequired } from "@automationstack/db/repositories/test-run-step-results-core";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import { cn } from "@automationstack/ui/lib/utils";
import { useCallback } from "react";

import { RUN_STEP_COLUMN_TITLE } from "@/components/test-runs/run-panel-typography";
import { useStepAttachments } from "@/components/test-runs/run-step-attachments-context";
import { StepActualAttachments } from "@/components/test-runs/step-actual-attachments";
import { StepActualResultText } from "@/components/test-runs/step-actual-result-text";
import { StepAdoptExpectedButton } from "@/components/test-runs/step-adopt-expected-button";
import { useStepAttachmentDrop } from "@/components/test-runs/use-step-attachment-drop";

interface StepActualResultFieldProps {
	/** 「设为预期结果」正在提交。 */
	adopting: boolean;
	editing: boolean;
	/** 设为预期结果。编辑中、并且实际结果有文字或图片时才显示这个按钮。 */
	onAdopt: (stepId: string) => void;
	onChange: (stepId: string, text: string) => void;
	/** 步骤的序号（从 1 开始），用于实际附件的名称。 */
	position: number;
	result: TestRunStepResult | undefined;
	stepId: string;
	value: string;
}

function ActualResultHeading({
	id,
	required,
}: {
	id: string;
	required: boolean;
}) {
	return (
		<div className="flex items-baseline gap-1.5">
			<h4 className={RUN_STEP_COLUMN_TITLE} id={id}>
				实际结果
			</h4>
			{required ? <span className="text-destructive text-xs">必填</span> : null}
		</div>
	);
}

/** 实际结果一栏的状态：实际附件、拖放、是否必填，以及带步骤 id 的输入回调。 */
function useActualResultField(
	stepId: string,
	result: TestRunStepResult | undefined,
	onChange: (stepId: string, text: string) => void
) {
	const judged = result !== undefined;
	const attachments = useStepAttachments(stepId, judged);
	const drop = useStepAttachmentDrop(attachments.canAdd, attachments.addFiles);
	const handleChange = useCallback(
		(text: string) => onChange(stepId, text),
		[onChange, stepId]
	);
	return {
		attachments,
		drop,
		handleChange,
		headingId: `run-step-actual-${stepId}`,
		judged,
		required: judged && actualResultRequired(result),
	};
}

/**
 * 步骤卡片的「实际结果」一栏：文字和实际附件。编辑时是输入框，失败和阻塞时必填；
 * 没有判定的步骤不能填写文字，也不能添加实际附件，先提示选择判定。
 * 可以把文件拖入这一栏、粘贴到输入框，或点「+」选择文件。不编辑时（包括已提交和已作废）只读。
 * 编辑中有实际结果时，可以把实际结果设为预期结果。
 */
export function StepActualResultField({
	adopting,
	editing,
	onAdopt,
	onChange,
	position,
	result,
	stepId,
	value,
}: StepActualResultFieldProps) {
	const { attachments, drop, handleChange, headingId, judged, required } =
		useActualResultField(stepId, result, onChange);
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
			<ActualResultHeading id={headingId} required={editing && required} />
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
			<StepAdoptExpectedButton
				attachments={attachments.items}
				editing={editing}
				onAdopt={onAdopt}
				pending={adopting}
				position={position}
				stepId={stepId}
				text={value}
			/>
		</section>
	);
}
