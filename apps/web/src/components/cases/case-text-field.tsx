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
	className?: string;
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
			{error ? (
				<p className="text-destructive text-xs" id={errorId}>
					{error}
				</p>
			) : null}
		</div>
	);
}
