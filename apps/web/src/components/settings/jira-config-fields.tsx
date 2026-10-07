import type { JiraConfigState } from "@automationstack/api/routers/jira";

import {
	type JiraFieldGroupProps,
	shown,
} from "@/components/settings/jira-field-group";
import { MASKED_SECRET_PLACEHOLDER } from "@/components/settings/jira-form-values";
import { JiraProjectFields } from "@/components/settings/jira-project-fields";
import { JiraSecretField } from "@/components/settings/jira-secret-field";
import { JiraTextField } from "@/components/settings/jira-text-field";
import { JiraWebhookFields } from "@/components/settings/jira-webhook-fields";

const SITE_URL_ID = "settings-jira-site-url";
const EMAIL_ID = "settings-jira-email";
const API_TOKEN_ID = "settings-jira-api-token";

function apiTokenHint(state: JiraConfigState): string {
	if (!state.secretStorageAvailable) {
		return "服务端未配置 SECRET_ENCRYPTION_KEY，API Token 无法加密落盘，因此这里暂时不能填写；请先在服务端设置该密钥（openssl rand -base64 32）后刷新本页。";
	}
	if (state.config?.hasApiToken === true) {
		return "已存有 API Token，内容不会回显。留空保存即保持当前 Token 不变。";
	}
	return "首次接入必须填写。在 Atlassian 账号的「安全」设置里创建 API Token。";
}

function JiraIdentityFields(props: JiraFieldGroupProps) {
	return (
		<>
			<JiraTextField
				error={shown(props.submitted, props.errors.siteUrl)}
				id={SITE_URL_ID}
				label="站点 URL"
				onValueChange={props.handlers.siteUrl}
				pending={props.pending}
				placeholder="https://your-team.atlassian.net"
				type="url"
				value={props.values.siteUrl}
			/>
			<JiraTextField
				error={shown(props.submitted, props.errors.email)}
				id={EMAIL_ID}
				label="邮箱"
				onValueChange={props.handlers.email}
				pending={props.pending}
				placeholder="you@example.com"
				type="email"
				value={props.values.email}
			/>
		</>
	);
}

function JiraApiTokenField(props: JiraFieldGroupProps) {
	const hasStoredToken = props.state.config?.hasApiToken === true;

	return (
		<JiraSecretField
			error={shown(props.submitted, props.errors.apiToken)}
			hint={apiTokenHint(props.state)}
			id={API_TOKEN_ID}
			label="API Token"
			onValueChange={props.handlers.apiToken}
			pending={props.pending}
			placeholder={
				hasStoredToken
					? MASKED_SECRET_PLACEHOLDER
					: "粘贴 Atlassian 签发的 API Token"
			}
			storageBlocked={!props.state.secretStorageAvailable}
			value={props.values.apiToken}
		/>
	);
}

export function JiraConfigFields(props: JiraFieldGroupProps) {
	return (
		<>
			<JiraIdentityFields {...props} />
			<JiraApiTokenField {...props} />
			<JiraProjectFields {...props} />
			<JiraWebhookFields {...props} />
		</>
	);
}
