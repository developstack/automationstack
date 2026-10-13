import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

import { CopyButton } from "@/components/auth-settings/copy-button";
import { FieldError } from "@/components/interaction/field-error";

export interface AuthUrlFieldProps {
	copyLabel: string;
	error?: string | null;
	hint: string;
	id: string;
	label: string;
	/** 没有这个回调时，输入框只读。 */
	onValueChange?: (value: string) => void;
	pending?: boolean;
	placeholder?: string;
	value: string;
}

/** 地址输入框，右侧有复制按钮。用于回调地址、集群内地址和 webhook 地址。 */
export function AuthUrlField(props: AuthUrlFieldProps) {
	const { onValueChange } = props;
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) =>
			onValueChange?.(event.target.value),
		[onValueChange]
	);
	const error = props.error ?? null;
	const hintId = `${props.id}-hint`;

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={props.id}>{props.label}</Label>
			<div className="flex items-center gap-2">
				<Input
					aria-describedby={
						error === null ? hintId : `${props.id}-error ${hintId}`
					}
					aria-invalid={error !== null}
					autoComplete="off"
					disabled={props.pending === true}
					id={props.id}
					onChange={handleChange}
					placeholder={props.placeholder}
					readOnly={onValueChange === undefined}
					spellCheck={false}
					type="url"
					value={props.value}
				/>
				<CopyButton label={props.copyLabel} value={props.value} />
			</div>
			<FieldError id={`${props.id}-error`} message={error} />
			<p className="text-muted-foreground text-xs" id={hintId}>
				{props.hint}
			</p>
		</div>
	);
}
