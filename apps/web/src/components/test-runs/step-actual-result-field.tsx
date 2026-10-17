import { actualResultRequired } from "@automationstack/db/repositories/test-run-step-results-core";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import { Textarea } from "@automationstack/ui/components/textarea";
import { cn } from "@automationstack/ui/lib/utils";
import { type ChangeEvent, type ClipboardEvent, useCallback } from "react";

import { RUN_STEP_COLUMN_TITLE } from "@/components/test-runs/run-panel-typography";
import { useStepAttachments } from "@/components/test-runs/run-step-attachments-context";
import { StepActualAttachments } from "@/components/test-runs/step-actual-attachments";
import { useStepAttachmentDrop } from "@/components/test-runs/use-step-attachment-drop";

const PLACEHOLDER =
	"这一步实际发生了什么。失败和阻塞时必填，会汇总进用例说明并带进 Jira。可以粘贴或拖入截图和录屏";

interface StepActualResultFieldProps {
	editing: boolean;
	onChange: (stepId: string, text: string) => void;
	/** 步骤的序号（从 1 开始），用于实际附件的名称。 */
	position: number;
	result: TestRunStepResult | undefined;
	stepId: string;
	value: string;
}

function ReadOnlyActualResult({ value }: { value: string }) {
	if (value.trim() === "") {
		return <p className="text-muted-foreground text-sm">—</p>;
	}
	return <p className="whitespace-pre-wrap break-words text-sm">{value}</p>;
}

interface ActualResultTextProps {
	editing: boolean;
	headingId: string;
	onChange: (text: string) => void;
	onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
	required: boolean;
	value: string;
}

/** 实际结果的文字：编辑时是输入框，可以粘贴文件；不编辑时只读。 */
function ActualResultText({
	editing,
	headingId,
	onChange,
	onPaste,
	required,
	value,
}: ActualResultTextProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
		[onChange]
	);
	if (!editing) {
		return <ReadOnlyActualResult value={value} />;
	}
	return (
		<Textarea
			aria-invalid={required && value.trim() === ""}
			aria-labelledby={headingId}
			aria-required={required}
			onChange={handleChange}
			onPaste={onPaste}
			placeholder={PLACEHOLDER}
			rows={3}
			value={value}
		/>
	);
}

/**
 * 步骤卡片的「实际结果」一栏：文字和实际附件。编辑时是输入框，失败和阻塞时必填；
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
	const attachments = useStepAttachments(stepId);
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
			<ActualResultText
				editing={editing}
				headingId={headingId}
				onChange={handleChange}
				onPaste={drop.handlePaste}
				required={required}
				value={value}
			/>
			<StepActualAttachments attachments={attachments} position={position} />
		</section>
	);
}
