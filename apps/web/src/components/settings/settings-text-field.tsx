import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

import { FieldError } from "@/components/interaction/field-error";

export interface SettingsTextFieldProps {
	error: string | null;
	id: string;
	label: string;
	onValueChange: (value: string) => void;
	pending: boolean;
	placeholder: string;
	type: "email" | "text" | "url";
	value: string;
}

function describedBy(id: string, hasError: boolean): string | undefined {
	return hasError ? `${id}-error` : undefined;
}

export function SettingsTextField(props: SettingsTextFieldProps) {
	const { onValueChange } = props;
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value),
		[onValueChange]
	);

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={props.id}>{props.label}</Label>
			<Input
				aria-describedby={describedBy(props.id, props.error !== null)}
				aria-invalid={props.error !== null}
				autoComplete="off"
				disabled={props.pending}
				id={props.id}
				onChange={handleChange}
				placeholder={props.placeholder}
				spellCheck={false}
				type={props.type}
				value={props.value}
			/>
			<FieldError id={`${props.id}-error`} message={props.error} />
		</div>
	);
}
