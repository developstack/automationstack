/**
 * 用例表单上半区的六个短字段（名称 / 维护人 / 标签 / 优先级 / 类型 / 状态）
 * 及其共用的栅格容器。
 *
 * 从 case-form.tsx 拆出来，那边只留下表单骨架。
 */
import type {
	CasePriority,
	CaseStatus,
	CaseType,
} from "@automationstack/db/schema/test-cases";
import { useCallback } from "react";

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
import { CaseSelectField } from "@/components/cases/case-select-field";
import { CaseTextField } from "@/components/cases/case-text-field";

export interface CaseFieldsProps {
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

/**
 * 六个短字段的栅格容器。它自己没有状态，纯粹是一层布局；单独成文件是为了让
 * CaseForm 只剩表单骨架。
 */
export function CaseFieldGrid({
	nameError,
	onChange,
	values,
}: CaseTextFieldsProps) {
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
