import { CASDOOR_WEBHOOK_URL_IN_CLUSTER } from "@automationstack/api/auth/casdoor-paths";

import type { AuthSettingsFieldGroupProps } from "@/components/auth-settings/auth-settings-field-group";
import { AuthUrlField } from "@/components/auth-settings/auth-url-field";
import { WebhookSecretActions } from "@/components/auth-settings/webhook-secret-actions";
import { MASKED_SECRET_PLACEHOLDER } from "@/components/settings/jira-form-values";
import { JiraSecretField } from "@/components/settings/jira-secret-field";
import { SettingsSection } from "@/components/settings/settings-section";

type WebhookProps = AuthSettingsFieldGroupProps & {
	onGenerate: () => void;
	onToggleClear: () => void;
};

function webhookSecretHint(props: WebhookProps): string {
	if (!props.view.secretStorageAvailable) {
		return "服务端没有配置 SECRET_ENCRYPTION_KEY，不能加密保存密钥，所以现在不能填写。";
	}
	if (props.values.clearWebhookSecret) {
		return "保存后清空 Webhook 密钥。";
	}
	if (props.view.hasWebhookSecret) {
		return "已保存 Webhook 密钥，内容不会显示。不填写就保留原值。";
	}
	return "至少 32 个字符。Casdoor 在请求头中发送这个密钥，服务端用它校验 webhook 请求。";
}

export function CasdoorWebhookFields(props: WebhookProps) {
	const storageBlocked = !props.view.secretStorageAvailable;

	return (
		<SettingsSection
			description="Casdoor 通过 webhook 通知用户和角色的变化。"
			headingId="auth-settings-webhook-heading"
			title="Webhook"
		>
			<AuthUrlField
				copyLabel="webhook 地址"
				hint={`这是 k8s 部署中的集群内地址。其他部署方式请把主机换成 Casdoor 能访问的 server 地址，路径保持 ${props.view.webhookPath}。`}
				id="auth-settings-webhook-url"
				label="Webhook 地址"
				value={CASDOOR_WEBHOOK_URL_IN_CLUSTER}
			/>
			<JiraSecretField
				clearRequested={props.values.clearWebhookSecret}
				error={props.errors.webhookSecret}
				hint={webhookSecretHint(props)}
				id="auth-settings-webhook-secret"
				label="Webhook 密钥"
				onToggleClear={
					props.view.hasWebhookSecret ? props.onToggleClear : undefined
				}
				onValueChange={props.handlers.webhookSecret}
				pending={props.pending}
				placeholder={
					props.view.hasWebhookSecret
						? MASKED_SECRET_PLACEHOLDER
						: "点击「生成」，或粘贴自己的随机串"
				}
				storageBlocked={storageBlocked}
				value={props.values.webhookSecret}
			/>
			<WebhookSecretActions
				disabled={storageBlocked || props.pending}
				onGenerate={props.onGenerate}
				value={props.values.webhookSecret}
			/>
		</SettingsSection>
	);
}
