import { Button } from "@automationstack/ui/components/button";

import { CopyButton } from "@/components/auth-settings/copy-button";

export function WebhookSecretActions({
	disabled,
	onGenerate,
	value,
}: {
	disabled: boolean;
	onGenerate: () => void;
	value: string;
}) {
	return (
		<div className="flex items-center gap-2">
			<Button
				disabled={disabled}
				onClick={onGenerate}
				size="sm"
				type="button"
				variant="outline"
			>
				生成
			</Button>
			<CopyButton label="Webhook 密钥" value={value} />
			<p className="text-muted-foreground text-xs">
				生成后，先复制到 Casdoor 的 webhook 请求头中，再保存。保存后不能再查看。
			</p>
		</div>
	);
}
