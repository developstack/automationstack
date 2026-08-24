/**
 * Jira 分区的两类字段控件。
 *
 * 拆成独立文件是因为它们的可访问性接线（label ↔ 控件、错误与说明如何进
 * aria-describedby）必须逐字段一致，摊在分区组件里迟早会有一格漏掉。
 *
 * **所有输入的 autoComplete 一律 off**：这几格没有一个是本站的登录凭据，
 * 让浏览器把 Jira 的邮箱记进密码库，下次会在本站登录页被误填；把 API Token
 * 记进去更糟。与 `provider/api-key-field.tsx` 同一条判断。
 */
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

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
			{props.error === null ? null : (
				<p className="text-destructive text-xs" id={`${props.id}-error`}>
					{props.error}
				</p>
			)}
		</div>
	);
}

export interface JiraSecretFieldProps {
	/** 已按下「清空」；此时输入框禁用，保存时会把这个字段置 null。 */
	clearRequested?: boolean;
	error: string | null;
	hint: string;
	id: string;
	label: string;
	onToggleClear?: () => void;
	onValueChange: (value: string) => void;
	pending: boolean;
	placeholder: string;
	/** 服务端主密钥未就绪时禁掉：与其让人填完再被 PRECONDITION_FAILED 拒绝。 */
	storageBlocked: boolean;
	value: string;
}

/** 只在库里已经有值时出现：没东西可清时给一颗死按钮只会让人以为出了错。 */
function ClearSecretButton({
	onToggle,
	pending,
	pressed,
}: {
	onToggle: () => void;
	pending: boolean;
	pressed: boolean;
}) {
	return (
		<Button
			aria-pressed={pressed}
			disabled={pending}
			onClick={onToggle}
			type="button"
			variant={pressed ? "destructive" : "outline"}
		>
			{pressed ? "取消清空" : "清空"}
		</Button>
	);
}

/**
 * 密文输入。三条红线与 `provider/api-key-field.tsx` 完全一致：
 * 1. 服务端永远不下发内容或长度，所以输入框永远从空开始，不存在「回填」；
 * 2. 留空 = 保持库里那份不变，清空必须走显式按钮，不是把框删空；
 * 3. 主密钥没就绪时直接禁掉并说明原因，而不是等人填完再报错。
 */
export function JiraSecretField(props: JiraSecretFieldProps) {
	const { onValueChange } = props;
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value),
		[onValueChange]
	);
	const cleared = props.clearRequested === true;
	const hintId = `${props.id}-hint`;

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={props.id}>{props.label}</Label>
			<div className="flex items-center gap-2">
				<Input
					aria-describedby={
						props.error === null ? hintId : `${props.id}-error ${hintId}`
					}
					aria-invalid={props.error !== null}
					autoComplete="off"
					disabled={props.storageBlocked || cleared || props.pending}
					id={props.id}
					onChange={handleChange}
					placeholder={
						props.storageBlocked
							? "主密钥未就绪，暂不可填写"
							: props.placeholder
					}
					spellCheck={false}
					// type="password" 而不是 text：密文不该被肩窥，也不该进浏览器的
					// 表单历史（那份历史是明文存盘的）
					type="password"
					value={props.value}
				/>
				{props.onToggleClear === undefined ? null : (
					<ClearSecretButton
						onToggle={props.onToggleClear}
						pending={props.pending}
						pressed={cleared}
					/>
				)}
			</div>
			{props.error === null ? null : (
				<p className="text-destructive text-xs" id={`${props.id}-error`}>
					{props.error}
				</p>
			)}
			<p
				className={
					props.storageBlocked
						? "text-destructive text-xs"
						: "text-muted-foreground text-xs"
				}
				id={hintId}
			>
				{props.hint}
			</p>
		</div>
	);
}
