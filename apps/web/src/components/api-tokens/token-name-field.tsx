import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

interface TokenNameFieldProps {
	error: string | null;
	hint: string;
	id: string;
	onChange: (value: string) => void;
	value: string;
}

export function TokenNameField({
	error,
	hint,
	id,
	onChange,
	value,
}: TokenNameFieldProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
		[onChange]
	);
	const messageId = `${id}-message`;

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>备注名</Label>
			<Input
				aria-describedby={messageId}
				aria-invalid={error !== null}
				autoComplete="off"
				id={id}
				onChange={handleChange}
				required={true}
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
