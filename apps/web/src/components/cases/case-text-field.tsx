/**
 * 用例表单里的单行文本字段（原 case-form-controls.tsx 的前半段）。
 *
 * 从 case-form.tsx 拆出来只是为了行数预算（那边 300 行封顶），职责没变；
 * 外框类与下拉字段（case-select-field.tsx）共用 case-field-classes.ts——
 * 标签在上、控件在下、中间固定 8px，所以不管被放进栅格的哪一格，
 * 标签基线与控件上边缘都在同一条水平线上。
 */
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { cn } from "@automationstack/ui/lib/utils";
import { type ChangeEvent, useCallback } from "react";

import {
	CONTROL_TEXT,
	FIELD_CLASS,
	LABEL_TEXT,
} from "@/components/cases/case-field-classes";

interface CaseTextFieldProps {
	/** 栅格定位类（如 sm:col-span-2），由 case-form-grid.ts 统一分配。 */
	className?: string;
	/** 内联错误文案；有值时字段进入 aria-invalid 并关联到错误节点。 */
	error?: string;
	id: string;
	label: string;
	onChange: (value: string) => void;
	placeholder: string;
	required?: boolean;
	value: string;
}

export function CaseTextField({
	className,
	error,
	id,
	label,
	onChange,
	placeholder,
	required,
	value,
}: CaseTextFieldProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
		[onChange]
	);
	const errorId = `${id}-error`;
	return (
		<div className={cn(FIELD_CLASS, className)}>
			<Label className={LABEL_TEXT} htmlFor={id}>
				{label}
			</Label>
			<Input
				aria-describedby={error ? errorId : undefined}
				aria-invalid={error !== undefined}
				className={CONTROL_TEXT}
				id={id}
				onChange={handleChange}
				placeholder={placeholder}
				required={required}
				value={value}
			/>
			{/* 错误文案与标签、输入框边框共用同一条起始边，不额外缩进 */}
			{error ? (
				<p className="text-destructive text-xs" id={errorId}>
					{error}
				</p>
			) : null}
		</div>
	);
}
