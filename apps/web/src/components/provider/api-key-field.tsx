/**
 * API Key 输入。
 *
 * 三条红线写在这里，任何改动都别越过：
 * 1. 服务端永远不下发 Key 的内容或长度，所以输入框永远从空开始，不存在「回填」；
 * 2. 留空 = 保持库里的 Key 不变，清空必须走显式的「清除 Key」，不是把框删空；
 * 3. 主密钥没就绪时直接把框禁掉并说明原因，而不是等管理员填完再报错。
 */
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

const FIELD_ID = "ai-provider-api-key";
const HINT_ID = "ai-provider-api-key-hint";

export interface ApiKeyFieldProps {
	/** 已按下「清除 Key」：保存时会带上 clearApiKey。 */
	clearRequested: boolean;
	hasStoredKey: boolean;
	onToggleClear: () => void;
	onValueChange: (value: string) => void;
	pending: boolean;
	/** 主密钥是否就绪；false 时服务端会拒绝保存 Key。 */
	secretStorageAvailable: boolean;
	value: string;
}

function hintText(props: ApiKeyFieldProps): string {
	if (!props.secretStorageAvailable) {
		return "服务端未配置 SECRET_ENCRYPTION_KEY，API Key 无法加密落盘，因此这里暂时不能填写；请先在服务端设置该密钥（openssl rand -base64 32）后刷新本页。";
	}
	if (props.clearRequested) {
		return "保存后将清空已存的 API Key，该配置随即变为不可用。";
	}
	if (props.hasStoredKey) {
		return "已存有 API Key，内容不会回显。留空保存即保持当前 Key 不变。";
	}
	return "尚未存有 API Key。留空保存的话，AI 功能仍然不可用。";
}

/** 只在库里已经有 Key 时出现：没有 Key 可清时给一颗死按钮只会让人以为出了错。 */
function ClearKeyButton({
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
			{pressed ? "取消清除" : "清除 Key"}
		</Button>
	);
}

export function ApiKeyField(props: ApiKeyFieldProps) {
	const { onValueChange } = props;
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value),
		[onValueChange]
	);
	const blocked = !props.secretStorageAvailable;
	const placeholder = props.hasStoredKey
		? "留空 = 保持当前 Key 不变"
		: "粘贴 provider 签发的 API Key";

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={FIELD_ID}>API Key</Label>
			<div className="flex items-center gap-2">
				<Input
					aria-describedby={HINT_ID}
					// 关掉自动填充：这一格不是登录密码，浏览器把它记进密码库只会帮倒忙
					autoComplete="off"
					disabled={blocked || props.clearRequested || props.pending}
					id={FIELD_ID}
					onChange={handleChange}
					placeholder={blocked ? "主密钥未就绪，暂不可填写" : placeholder}
					spellCheck={false}
					type="password"
					value={props.value}
				/>
				{props.hasStoredKey ? (
					<ClearKeyButton
						onToggle={props.onToggleClear}
						pending={props.pending}
						pressed={props.clearRequested}
					/>
				) : null}
			</div>
			<p
				className={
					blocked ? "text-destructive text-xs" : "text-muted-foreground text-xs"
				}
				id={HINT_ID}
			>
				{hintText(props)}
			</p>
		</div>
	);
}
