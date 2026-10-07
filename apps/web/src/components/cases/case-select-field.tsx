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
