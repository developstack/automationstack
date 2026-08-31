/**
 * 用例表单里的下拉选择字段。
 *
 * 与 case-text-field.tsx 同源（原 case-form-controls.tsx），外框类走同一份
 * case-field-classes.ts：不管被放进栅格的哪一格，标签基线与控件上边缘都在
 * 同一条水平线上。
 */
import { Label } from "@automationstack/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { cn } from "@automationstack/ui/lib/utils";
import { useCallback } from "react";

import {
	CONTROL_TEXT,
	FIELD_CLASS,
	LABEL_TEXT,
} from "@/components/cases/case-field-classes";
import type { CaseOption } from "@/components/cases/case-meta";

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
