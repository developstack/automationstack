import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import type { ChangeEvent } from "react";

export interface LoginFieldProps {
	autoComplete: string;
	id: string;
	label: string;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	type?: string;
	value: string;
}

export function LoginField({ id, label, type, ...props }: LoginFieldProps) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			<Input id={id} required={true} type={type} {...props} />
		</div>
	);
}
