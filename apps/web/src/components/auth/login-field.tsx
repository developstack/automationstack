import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, type Ref, useCallback } from "react";

import { PasswordInput } from "@/components/auth/password-input";

export interface LoginFieldProps {
	autoComplete: string;
	/** 输入框下方的错误提示。为 null 时不显示，输入框也不标红。 */
	error: string | null;
	id: string;
	inputRef?: Ref<HTMLInputElement>;
	label: string;
	onChange: (value: string) => void;
	/** password 使用共享的密码输入组件，右侧带显示/隐藏密码的按钮。 */
	type?: "password" | "text";
	value: string;
}

export function LoginField({
	autoComplete,
	error,
	id,
	inputRef,
	label,
	onChange,
	type = "text",
	value,
}: LoginFieldProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
		[onChange]
	);
	const messageId = `${id}-message`;
	const inputProps = {
		"aria-describedby": error === null ? undefined : messageId,
		"aria-invalid": error !== null,
		"aria-required": true,
		autoComplete,
		id,
		onChange: handleChange,
		ref: inputRef,
		value,
	};

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			{type === "password" ? (
				<PasswordInput {...inputProps} />
			) : (
				<Input {...inputProps} type="text" />
			)}
			{error === null ? null : (
				<p className="text-destructive text-xs" id={messageId}>
					{error}
				</p>
			)}
		</div>
	);
}
