import type {
	CaseStep,
	CaseStepScreenshotKey,
} from "@automationstack/db/schema/test-cases";

import { MarkdownField } from "@/components/cases/markdown-field";
import { StepScreenshotEditor } from "@/components/cases/step-screenshot-editor";
import {
	type StepChange,
	useStepScreenshotGroup,
} from "@/components/cases/use-step-screenshot-group";

interface StepCellEditorProps {
	ariaLabel: string;
	/** 这一栏的截图：操作步骤一栏是操作截图，预期结果一栏是预期截图。 */
	group: CaseStepScreenshotKey;
	onChange: StepChange;
	onTextChange: (value: string) => void;
	placeholder: string;
	position: number;
	preview: boolean;
	step: CaseStep;
	value: string;
}

/** 步骤编辑器的一栏：输入框，下方是这一栏的截图。粘贴到输入框的图片加入这一栏的截图，不写入文字。 */
export function StepCellEditor({
	ariaLabel,
	group,
	onChange,
	onTextChange,
	placeholder,
	position,
	preview,
	step,
	value,
}: StepCellEditorProps) {
	const edit = useStepScreenshotGroup(step, group, onChange);
	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<MarkdownField
				ariaLabel={ariaLabel}
				onChange={onTextChange}
				onPasteImages={edit.addFiles}
				placeholder={placeholder}
				preview={preview}
				value={value}
			/>
			<StepScreenshotEditor edit={edit} group={group} position={position} />
		</div>
	);
}
