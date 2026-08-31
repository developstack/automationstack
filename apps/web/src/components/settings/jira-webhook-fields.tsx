/**
 * 「Jira 集成」的 webhook 字段组（回调地址与它的密钥），
 * 自 jira-settings-fields.tsx（已改名为 jira-config-fields.tsx）拆出。
 * 共用的 props 形状在 jira-field-group.ts。
 */
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

/**
 * 回调地址与它的密钥。地址由服务端给出路径、这里拼上 origin，只在已经存过
 * 配置时才显示：没有配置就没有 webhookPath，凭空拼一条地址给人去 Jira 里填，
 * 填完的每一次投递都会 404。
 *
 * 「清空」按钮只在库里确实有密钥时才挂上去（`onToggleClear` 给 undefined 时
 * 字段自己不渲染按钮）：没东西可清时给一颗死按钮只会让人以为出了错。
 */
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
