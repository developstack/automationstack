import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

interface PlatformUserFieldProps {
	autoComplete: string;
	error: string | null;
	hint: string;
	id: string;
	label: string;
	onChange: (value: string) => void;
	type?: "password" | "text";
	value: string;
}

export function PlatformUserField({
	autoComplete,
	error,
	hint,
	id,
	label,
	onChange,
	type = "text",
	value,
}: PlatformUserFieldProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
		[onChange]
	);
	const messageId = `${id}-message`;

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				aria-describedby={messageId}
				aria-invalid={error !== null}
				autoComplete={autoComplete}
				id={id}
				onChange={handleChange}
				required={true}
				type={type}
				value={value}
			/>
			<p
				className={
					error === null
						? "text-muted-foreground text-xs"
						: "text-destructive text-xs"
				}
				id={messageId}
			>
				{error ?? hint}
			</p>
		</div>
	);
}
