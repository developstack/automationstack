import type {
	CasePriority,
	CaseStatus,
	CaseStep,
	CaseType,
} from "@automationstack/db/schema/test-cases";
import { type FormEvent, useCallback } from "react";

import {
	CaseSelectField,
	CaseTextField,
} from "@/components/cases/case-form-controls";
import {
	CASE_FIELD_GRID_CLASS,
	CASE_FIELD_SPAN_CLASS,
} from "@/components/cases/case-form-grid";
import { CASE_NAME_FIELD_ID } from "@/components/cases/case-form-validation";
import {
	CASE_TYPE_OPTIONS,
	type CaseFormValues,
	PRIORITY_OPTIONS,
	STATUS_OPTIONS,
} from "@/components/cases/case-meta";
import { MarkdownField } from "@/components/cases/markdown-field";
import { StepsEditor } from "@/components/cases/steps-editor";

interface CaseFieldsProps {
	onChange: (values: CaseFormValues) => void;
	values: CaseFormValues;
}

interface CaseTextFieldsProps extends CaseFieldsProps {
	nameError?: string;
}

/** 三个文本字段的 onChange 收在一起，组件本体只剩渲染。 */
function useCaseTextHandlers({ onChange, values }: CaseFieldsProps) {
	const handleName = useCallback(
		(name: string) => onChange({ ...values, name }),
		[onChange, values]
	);
	const handleMaintainer = useCallback(
		(maintainer: string) => onChange({ ...values, maintainer }),
		[onChange, values]
	);
	const handleTags = useCallback(
		(tagsText: string) => onChange({ ...values, tagsText }),
		[onChange, values]
	);
	return { handleMaintainer, handleName, handleTags };
}

/**
 * 用例名称 / 维护人 / 标签。
 * 返回 fragment 而不是自己包一层 <div>：这三个字段必须是外层 6 轨栅格的
 * 直接子项，套一层容器就又变成一套独立的列宽了。
 */
function CaseTextFields({ nameError, onChange, values }: CaseTextFieldsProps) {
	const handlers = useCaseTextHandlers({ onChange, values });

	return (
		<>
			<CaseTextField
				className={CASE_FIELD_SPAN_CLASS.name}
				error={nameError}
				id={CASE_NAME_FIELD_ID}
				label="用例名称"
				onChange={handlers.handleName}
				placeholder="例如：下单成功后跳转支付页"
				required={true}
				value={values.name}
			/>
			<CaseTextField
				className={CASE_FIELD_SPAN_CLASS.maintainer}
				id="case-maintainer"
				label="维护人"
				onChange={handlers.handleMaintainer}
				placeholder="自由填写，如：张三"
				value={values.maintainer}
			/>
			<CaseTextField
				className={CASE_FIELD_SPAN_CLASS.tags}
				id="case-tags"
				label="标签"
				onChange={handlers.handleTags}
				placeholder="逗号分隔，如：冒烟, 支付"
				value={values.tagsText}
			/>
		</>
	);
}

/** 三个枚举字段的 onChange。 */
function useCaseEnumHandlers({ onChange, values }: CaseFieldsProps) {
	const handlePriority = useCallback(
		(priority: CasePriority) => onChange({ ...values, priority }),
		[onChange, values]
	);
	const handleCaseType = useCallback(
		(caseType: CaseType) => onChange({ ...values, caseType }),
		[onChange, values]
	);
	const handleStatus = useCallback(
		(status: CaseStatus) => onChange({ ...values, status }),
		[onChange, values]
	);
	return { handleCaseType, handlePriority, handleStatus };
}

/** 优先级 / 用例类型 / 状态，同样是外层栅格的直接子项。 */
function CaseEnumFields({ onChange, values }: CaseFieldsProps) {
	const handlers = useCaseEnumHandlers({ onChange, values });

	return (
		<>
			<CaseSelectField
				className={CASE_FIELD_SPAN_CLASS.priority}
				id="case-priority"
				label="优先级"
				onChange={handlers.handlePriority}
				options={PRIORITY_OPTIONS}
				value={values.priority}
			/>
			<CaseSelectField
				className={CASE_FIELD_SPAN_CLASS.caseType}
				id="case-type"
				label="用例类型"
				onChange={handlers.handleCaseType}
				options={CASE_TYPE_OPTIONS}
				value={values.caseType}
			/>
			<CaseSelectField
				className={CASE_FIELD_SPAN_CLASS.status}
				id="case-status"
				label="状态"
				onChange={handlers.handleStatus}
				options={STATUS_OPTIONS}
				value={values.status}
			/>
		</>
	);
}

interface CaseFormProps extends CaseFieldsProps {
	/**
	 * 提交按钮通常不在 <form> 内部（详情面板的「保存」在标题栏里），
	 * 靠这个 id 让按钮用 form="..." 关联提交。
	 */
	formId?: string;
	nameError?: string;
	onSubmit?: () => void;
}

/**
 * 六个短字段的栅格容器。提到模块作用域是为了让 CaseForm 只剩表单骨架，
 * 它自己没有状态，纯粹是一层布局。
 */
function CaseFieldGrid({ nameError, onChange, values }: CaseTextFieldsProps) {
	return (
		/*
		 * 六个短字段共用一个栅格容器（轨道定义见 case-form-grid.ts）。
		 * 之前它们分在两个列数不同的栅格里，竖向分界一行一个位置；
		 * 合成一套轨道后，1/3 与 2/3 两条竖边在行与行之间上下贯通。
		 */
		<div className={CASE_FIELD_GRID_CLASS}>
			<CaseTextFields
				nameError={nameError}
				onChange={onChange}
				values={values}
			/>
			<CaseEnumFields onChange={onChange} values={values} />
		</div>
	);
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
