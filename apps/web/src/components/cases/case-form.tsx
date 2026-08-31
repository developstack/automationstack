import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { type FormEvent, useCallback } from "react";

import {
	CaseFieldGrid,
	type CaseFieldsProps,
} from "@/components/cases/case-field-grid";
import { MarkdownField } from "@/components/cases/markdown-field";
import { StepsEditor } from "@/components/cases/steps-editor";

interface CaseFormProps extends CaseFieldsProps {
	/**
	 * 提交按钮通常不在 <form> 内部（详情面板的「保存」在标题栏里），
	 * 靠这个 id 让按钮用 form="..." 关联提交。
	 */
	formId?: string;
	nameError?: string;
	onSubmit?: () => void;
}

interface CaseBodyHandlersProps extends CaseFieldsProps {
	onSubmit?: () => void;
}

/** 表单主体（前置条件 / 步骤 / 提交）的回调收在一起，组件本体只剩渲染。 */
function useCaseBodyHandlers({
	onChange,
	onSubmit,
	values,
}: CaseBodyHandlersProps) {
	const handlePreconditions = useCallback(
		(preconditions: string) => onChange({ ...values, preconditions }),
		[onChange, values]
	);
	const handleSteps = useCallback(
		(steps: CaseStep[]) => onChange({ ...values, steps }),
		[onChange, values]
	);
	// 没有 <form> 时输入框里按 Enter 不会提交，中文输入法用户尤其依赖这一步。
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			onSubmit?.();
		},
		[onSubmit]
	);
	return { handlePreconditions, handleSteps, handleSubmit };
}

/** Plain useState-driven case editor; the parent owns the values. */
export function CaseForm({
	formId,
	nameError,
	onChange,
	onSubmit,
	values,
}: CaseFormProps) {
	const handlers = useCaseBodyHandlers({ onChange, onSubmit, values });

	return (
		<form
			className="flex flex-col gap-4"
			id={formId}
			noValidate={true}
			onSubmit={handlers.handleSubmit}
		>
			<CaseFieldGrid
				nameError={nameError}
				onChange={onChange}
				values={values}
			/>
			{/* ariaLabel 与可见 label 同文案：聚焦后真正拿到焦点的是编辑器的
			    contenteditable，htmlFor 关联不到它，只能靠可访问名对齐。 */}
			<MarkdownField
				ariaLabel="前置条件"
				id="case-preconditions"
				label="前置条件"
				onChange={handlers.handlePreconditions}
				placeholder="可选，支持 markdown"
				value={values.preconditions}
			/>
			<StepsEditor onChange={handlers.handleSteps} steps={values.steps} />
		</form>
	);
}
