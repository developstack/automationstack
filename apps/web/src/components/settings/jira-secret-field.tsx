/**
 * Jira 分区的密文字段，自 jira-fields.tsx 拆出。
 *
 * **autoComplete 一律 off**：把 Jira 的 API Token 记进浏览器的密码库，比记邮箱
 * 更糟。与 `provider/api-key-field.tsx` 同一条判断；明文那几格
 * （jira-text-field.tsx）同理。
 */
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

import { JiraFieldError } from "@/components/settings/jira-field-error";

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
 * 说明行。主密钥未就绪时整段改成 destructive 色：那一刻这句话不再是补充
 * 说明，而是输入框为什么被禁掉的唯一解释；混在普通灰字里会被连同其它说明
 * 一起跳过，人只看到一个点不动的框，找不到原因。
 */
function JiraSecretHint({
	hint,
	hintId,
	storageBlocked,
}: {
	hint: string;
	hintId: string;
	storageBlocked: boolean;
}) {
	return (
		<p
			className={
				storageBlocked
					? "text-destructive text-xs"
					: "text-muted-foreground text-xs"
			}
			id={hintId}
		>
			{hint}
		</p>
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
	// 主密钥未就绪时框是禁用的，占位符此时要回答「为什么不能填」而不是「填什么」
	const placeholder = props.storageBlocked
		? "主密钥未就绪，暂不可填写"
		: props.placeholder;

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
					placeholder={placeholder}
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
			<JiraFieldError id={`${props.id}-error`} message={props.error} />
			<JiraSecretHint
				hint={props.hint}
				hintId={hintId}
				storageBlocked={props.storageBlocked}
			/>
		</div>
	);
}
