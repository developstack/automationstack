import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

import { FieldError } from "@/components/interaction/field-error";

export interface JiraSecretFieldProps {
	clearRequested?: boolean;
	error: string | null;
	hint: string;
	id: string;
	label: string;
	onToggleClear?: () => void;
	onValueChange: (value: string) => void;
	pending: boolean;
	placeholder: string;
	storageBlocked: boolean;
	value: string;
}

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

export function JiraSecretField(props: JiraSecretFieldProps) {
	const { onValueChange } = props;
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value),
		[onValueChange]
	);
	const cleared = props.clearRequested === true;
	const hintId = `${props.id}-hint`;
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
			<FieldError id={`${props.id}-error`} message={props.error} />
			<JiraSecretHint
				hint={props.hint}
				hintId={hintId}
				storageBlocked={props.storageBlocked}
			/>
		</div>
	);
}
