/**
 * 平台用户表单里的单行字段。原名 platform-user-form-fields.tsx，按「文件名与
 * 唯一对外组件同名」改到这里；同住的 PlatformUserFormError 见
 * platform-user-form-error.tsx。
 */
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

interface PlatformUserFieldProps {
	autoComplete: string;
	/** 内联错误文案；为 null 时该位置展示 hint 里的规则说明。 */
	error: string | null;
	hint: string;
	id: string;
	label: string;
	onChange: (value: string) => void;
	type?: "password" | "text";
	value: string;
}

/** 用户名 / 密码这类单行字段：标签、输入框，以及规则与错误共用的一行说明。 */
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
			{/*
			 * 规则说明与错误共用同一个节点：错误出现时不会凭空插进一行，
			 * 底下的字段和按钮不跟着往下跳。
			 */}
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
