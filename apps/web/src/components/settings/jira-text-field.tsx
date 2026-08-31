/**
 * Jira 分区的明文字段，自 jira-fields.tsx 拆出。
 *
 * **autoComplete 一律 off**：这几格没有一个是本站的登录凭据，让浏览器把 Jira
 * 的邮箱记进密码库，下次会在本站登录页被误填。与 `provider/api-key-field.tsx`
 * 同一条判断；密文那一格（jira-secret-field.tsx）同理。
 */
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

import { JiraFieldError } from "@/components/settings/jira-field-error";

export interface JiraTextFieldProps {
	error: string | null;
	/** 常量前缀，本文件按它派生出说明/错误的 id。 */
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

export function JiraTextField(props: JiraTextFieldProps) {
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
				// 站点地址、project key 这类标识符被拼写检查画红波浪线只是噪音
				spellCheck={false}
				type={props.type}
				value={props.value}
			/>
			<JiraFieldError id={`${props.id}-error`} message={props.error} />
		</div>
	);
}
