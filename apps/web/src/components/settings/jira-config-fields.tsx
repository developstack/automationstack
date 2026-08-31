/**
 * 「Jira 集成」表单里的字段组：本文件装的是身份（站点、邮箱）与 API Token
 * 两组，另外两组各自成文件（jira-project-fields.tsx、jira-webhook-fields.tsx），
 * 由下面的 JiraConfigFields 按页面顺序摆在一起。
 *
 * 从 `jira-settings-section.tsx` 抽出来只为把 `JiraConfigFormView` 压回 50 行、
 * 复杂度 10 以内。四组共用的 props 形状、handlers 与「提交过才标红」那条策略
 * 在 jira-field-group.ts；这里每一个组件都是纯展示组件，一个 hook 都不许持有
 * （理由同样写在那份文件顶部）。
 */
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

/** 站点地址与账号邮箱：定位到哪个 Jira、以谁的身份说话。 */
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

/**
 * API Token。占位符在库里已有 Token 时换成遮罩点，且**只是占位符**——
 * 服务端从不下发内容或长度，输入框的 value 永远是本次会话新输入的那份。
 */
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

/**
 * 四组字段的排列顺序就是页面上的顺序，别重排：API Token 夹在「账号」与
 * 「项目」之间不是随手放的，凭据填完紧接着就是它，跨过一段无关的项目字段
 * 再回头找 Token 是最容易漏填的一格。
 */
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
