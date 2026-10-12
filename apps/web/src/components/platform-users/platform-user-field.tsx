import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

import { PasswordInput } from "@/components/auth/password-input";

interface PlatformUserFieldProps {
	autoComplete: string;
	error: string | null;
	hint: string;
	id: string;
	label: string;
	onChange: (value: string) => void;
	// 为 true 且 type 为 password 时，密码框右侧带显示/隐藏密码的按钮
	revealable?: boolean;
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
	revealable = false,
	type = "text",
	value,
}: PlatformUserFieldProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
		[onChange]
	);
	const messageId = `${id}-message`;
	const inputProps = {
		"aria-describedby": messageId,
		"aria-invalid": error !== null,
		autoComplete,
		id,
		onChange: handleChange,
		required: true,
		value,
	};

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			{revealable && type === "password" ? (
				<PasswordInput {...inputProps} />
			) : (
				<Input {...inputProps} type={type} />
			)}
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
