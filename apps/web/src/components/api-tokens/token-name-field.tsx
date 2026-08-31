/**
 * 创建 Token 表单里的备注名字段。原名 api-token-form-fields.tsx，按「文件名与
 * 唯一对外组件同名」改到这里；同住的 ApiTokenFormError 见
 * api-token-form-error.tsx。
 */
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

interface TokenNameFieldProps {
	/** 内联错误文案；为 null 时该位置展示 hint 里的规则说明。 */
	error: string | null;
	hint: string;
	id: string;
	onChange: (value: string) => void;
	value: string;
}

/** 备注名这一格：标签、输入框，以及规则与错误共用的一行说明。 */
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
				// 备注名不是账号信息，让密码管理器来猜只会填进一串无关的东西
				autoComplete="off"
				id={id}
				onChange={handleChange}
				required={true}
				value={value}
			/>
			{/*
			 * 规则说明与错误共用同一个节点：错误出现时不会凭空插进一行，
			 * 底下的按钮不跟着往下跳。
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
