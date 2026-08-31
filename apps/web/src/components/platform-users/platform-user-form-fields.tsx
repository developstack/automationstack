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

/**
 * 服务端错误（用户名已占用、最后一个管理员等）就地显示。
 * role="alert" 让读屏在提交失败时立即播报，位置紧贴提交按钮上方。
 *
 * 与 project-members/project-member-form-error.tsx 是同形的两份，刻意不合并：
 * 那一份当初正是从本目录的前身（已删除的 components/members/）搬过去的，搬家的
 * 理由写在它的头注释里——留一个只为跨作用域共享而存在的目录，下一个人会以为那
 * 里还有别的东西。两个作用域各留一份 12 行的组件，比再造一个共享目录便宜。
 */
export function PlatformUserFormError({
	message,
}: {
	message: string | undefined;
}) {
	if (message === undefined) {
		return null;
	}
	return (
		<p className="text-destructive text-xs" role="alert">
			{message}
		</p>
	);
}
