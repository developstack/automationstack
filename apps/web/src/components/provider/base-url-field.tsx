/**
 * base URL 是独立必填字段，不是 provider 的附属品。
 *
 * 上游 193 个 provider 里有 26 个（anthropic、google 等）根本没给 OpenAI 兼容端点，
 * 选中它们时这一格只能留空等管理员填；有默认值的则预填进来，但照样可改——
 * 自建网关、代理、私有部署都要落在这一格里。
 */
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

const FIELD_ID = "ai-provider-base-url";
const MESSAGE_ID = "ai-provider-base-url-message";

const HINT =
	"provider 的 OpenAI 兼容端点。目录里带默认地址的 provider 会自动填入，可以改成自建网关。";

export interface BaseUrlFieldProps {
	/** 校验错误；为 null 时这一行展示规则说明。 */
	error: string | null;
	onValueChange: (value: string) => void;
	pending: boolean;
	value: string;
}

export function BaseUrlField(props: BaseUrlFieldProps) {
	const { onValueChange } = props;
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value),
		[onValueChange]
	);

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={FIELD_ID}>Base URL</Label>
			<Input
				aria-describedby={MESSAGE_ID}
				aria-invalid={props.error !== null}
				autoComplete="off"
				disabled={props.pending}
				id={FIELD_ID}
				inputMode="url"
				onChange={handleChange}
				placeholder="https://api.example.com/v1"
				spellCheck={false}
				value={props.value}
			/>
			{/*
			 * 说明与错误共用同一个节点：报错时不会凭空多出一行，
			 * 底下的 API Key 和保存按钮不跟着往下跳。
			 */}
			<p
				className={
					props.error === null
						? "text-muted-foreground text-xs"
						: "text-destructive text-xs"
				}
				id={MESSAGE_ID}
			>
				{props.error ?? HINT}
			</p>
		</div>
	);
}
