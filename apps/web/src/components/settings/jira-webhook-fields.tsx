import type { JiraConfigState } from "@automationstack/api/routers/jira";
import { env } from "@automationstack/env/web";

import type { JiraFieldGroupProps } from "@/components/settings/jira-field-group";
import {
	buildJiraWebhookUrl,
	MASKED_SECRET_PLACEHOLDER,
} from "@/components/settings/jira-form-values";
import { JiraSecretField } from "@/components/settings/jira-secret-field";
import { JiraWebhookUrl } from "@/components/settings/jira-webhook-url";

const WEBHOOK_SECRET_ID = "settings-jira-webhook-secret";

function webhookSecretHint(state: JiraConfigState, cleared: boolean): string {
	if (cleared) {
		return "保存后将清空密钥，issue 状态同步随即停止工作（webhook 端点会拒绝所有请求）。";
	}
	if (state.config?.hasWebhookSecret === true) {
		return "已存有密钥，内容不会回显。留空保存即保持不变。";
	}
	return "没有密钥时 webhook 端点会拒绝一切请求，状态同步不工作。填一段随机串，并在 Jira 的 webhook 配置里填同一串。";
}

export function JiraWebhookFields(props: JiraFieldGroupProps) {
	const { config } = props.state;
	const hasStoredSecret = config?.hasWebhookSecret === true;
	const cleared = props.values.clearWebhookSecret;

	return (
		<>
			{config === null ? null : (
				<JiraWebhookUrl
					url={buildJiraWebhookUrl(env.VITE_SERVER_URL, config.webhookPath)}
				/>
			)}
			<JiraSecretField
				clearRequested={cleared}
				error={null}
				hint={webhookSecretHint(props.state, cleared)}
				id={WEBHOOK_SECRET_ID}
				label="Webhook 密钥"
				onToggleClear={hasStoredSecret ? props.onToggleClear : undefined}
				onValueChange={props.handlers.webhookSecret}
				pending={props.pending}
				placeholder={
					hasStoredSecret ? MASKED_SECRET_PLACEHOLDER : "自己生成一段随机串"
				}
				storageBlocked={false}
				value={props.values.webhookSecret}
			/>
		</>
	);
}
