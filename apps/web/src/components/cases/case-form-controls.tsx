/**
 * 用例表单里的两种基础字段（单行文本 / 下拉选择）。
 *
 * 从 case-form.tsx 拆出来只是为了行数预算（那边 300 行封顶），职责没变：
 * 两者的外框类完全一致——标签在上、控件在下、中间固定 8px——所以不管被放进
 * 栅格的哪一格，标签基线与控件上边缘都在同一条水平线上。
 */
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { cn } from "@automationstack/ui/lib/utils";
import { type ChangeEvent, useCallback } from "react";

import type { CaseOption } from "@/components/cases/case-meta";

/*
 * 编辑界面统一用 14px（text-sm），不再吃 Sheet / Dialog 基类上的 12px。
 * 覆盖写在内容层而不是改 packages/ui 的基类：那两条 text-xs/relaxed 是全站
 * 所有抽屉与弹窗的默认字号，为了用例编辑去掀基类会波及每一个弹层。
 */
const CONTROL_TEXT = "text-sm";
const LABEL_TEXT = "text-sm";

/**
 * 字段外框：标签与控件之间 8px。
 * markdown 字段（markdown-field.tsx）用的是同一档，表单里每个标签到控件的
 * 距离才都一样；这一档也必须小于字段之间的 16px，字段才分得出组。
 */
const FIELD_CLASS = "flex flex-col gap-2";

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

interface CaseSelectFieldProps<TValue extends string> {
	/** 栅格定位类（如 sm:col-span-2），由 case-form-grid.ts 统一分配。 */
	className?: string;
	id: string;
	label: string;
	onChange: (value: TValue) => void;
	options: readonly CaseOption[];
	value: TValue;
}

export function CaseSelectField<TValue extends string>({
	className,
	id,
	label,
	onChange,
	options,
	value,
}: CaseSelectFieldProps<TValue>) {
	const handleValueChange = useCallback(
		(next: string | null) => {
			if (next !== null) {
				onChange(next as TValue);
			}
		},
		[onChange]
	);
	return (
		<div className={cn(FIELD_CLASS, className)}>
			<Label className={LABEL_TEXT} htmlFor={id}>
				{label}
			</Label>
			{/* w-full 顶掉基类的 w-fit：触发器要和同格的 Input 一样铺满整格 */}
			<Select items={options} onValueChange={handleValueChange} value={value}>
				<SelectTrigger className={cn("w-full", CONTROL_TEXT)} id={id}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
