/**
 * 「Jira 集成」表单里的字段组。
 *
 * 从 `jira-settings-section.tsx` 抽出来只为把 `JiraConfigFormView` 压回 50 行、
 * 复杂度 10 以内。分界线刻意划在「无状态」这一侧：表单的 state、校验、保存
 * 与自检全部留在 `useJiraConfigForm` 里，由分区组件在原位、原顺序调用；这里
 * 每一个导出都是纯展示组件，一个 hook 都不许持有。理由不是洁癖——受控输入
 * 的 state 一旦跟着 JSX 搬进子组件，每敲一个字符就是一次子树重建，焦点当场
 * 掉在第一个字符后面；两个密文格更不能碰，它们的「留空 = 不变」语义全靠
 * 值一直待在同一个 state 实例里。
 *
 * 六格字段按语义分成四组，四组共用同一份 `JiraFieldGroupProps`：字段的 id、
 * 占位符、说明文案逐格不同，但取值的来源、禁用条件和「提交过才标红」这条
 * 策略必须逐格一致，各组自己开一套 props 就是给漏掉某一格留位置。
 */
import type { JiraConfigState } from "@automationstack/api/routers/jira";
import { env } from "@automationstack/env/web";
import { useCallback } from "react";

import {
	JiraSecretField,
	JiraTextField,
} from "@/components/settings/jira-fields";
import {
	buildJiraWebhookUrl,
	type JiraFieldErrors,
	type JiraFormValues,
	MASKED_SECRET_PLACEHOLDER,
} from "@/components/settings/jira-form-values";
import { JiraWebhookUrl } from "@/components/settings/jira-webhook-url";

const SITE_URL_ID = "settings-jira-site-url";
const EMAIL_ID = "settings-jira-email";
const API_TOKEN_ID = "settings-jira-api-token";
const PROJECT_KEY_ID = "settings-jira-project-key";
const ISSUE_TYPE_ID = "settings-jira-issue-type";
const WEBHOOK_SECRET_ID = "settings-jira-webhook-secret";

/** 五个 onChange 都要稳定引用：JSX 上现造闭包会让每次输入都重挂控件。 */
export function useFieldHandlers(
	patch: (next: Partial<JiraFormValues>) => void
) {
	return {
		apiToken: useCallback((apiToken: string) => patch({ apiToken }), [patch]),
		defaultIssueType: useCallback(
			(defaultIssueType: string) => patch({ defaultIssueType }),
			[patch]
		),
		email: useCallback((email: string) => patch({ email }), [patch]),
		projectKey: useCallback(
			(projectKey: string) => patch({ projectKey }),
			[patch]
		),
		siteUrl: useCallback((siteUrl: string) => patch({ siteUrl }), [patch]),
		webhookSecret: useCallback(
			(webhookSecret: string) => patch({ webhookSecret }),
			[patch]
		),
	};
}

export type JiraFieldHandlers = ReturnType<typeof useFieldHandlers>;

export interface JiraFieldGroupProps {
	errors: JiraFieldErrors;
	handlers: JiraFieldHandlers;
	/** 只有「Webhook 密钥」用得上；放在共用 props 里换掉一层逐格转发。 */
	onToggleClear: () => void;
	pending: boolean;
	state: JiraConfigState;
	/** 提交过一次没有？各格的红字都要过 `shown()` 这一关，见下。 */
	submitted: boolean;
	values: JiraFormValues;
}

/**
 * 提交过一次之后才标红；之前只做校验不显示。
 *
 * 写成模块级函数而不是在分区组件里现造一个闭包往下传：传下去的闭包每次渲染
 * 都是新引用（biome 的 noJsxPropsBind 正是拦这个），而把 `submitted` 摊给各组
 * 自己判，迟早会有一格判反——那一格就会在用户还没提交时先劈头标红。
 */
function shown(submitted: boolean, message: string | null): string | null {
	return submitted ? message : null;
}

function apiTokenHint(state: JiraConfigState): string {
	if (!state.secretStorageAvailable) {
		return "服务端未配置 SECRET_ENCRYPTION_KEY，API Token 无法加密落盘，因此这里暂时不能填写；请先在服务端设置该密钥（openssl rand -base64 32）后刷新本页。";
	}
	if (state.config?.hasApiToken === true) {
		return "已存有 API Token，内容不会回显。留空保存即保持当前 Token 不变。";
	}
	return "首次接入必须填写。在 Atlassian 账号的「安全」设置里创建 API Token。";
}

function webhookSecretHint(state: JiraConfigState, cleared: boolean): string {
	if (cleared) {
		return "保存后将清空密钥，issue 状态同步随即停止工作（webhook 端点会拒绝所有请求）。";
	}
	if (state.config?.hasWebhookSecret === true) {
		return "已存有密钥，内容不会回显。留空保存即保持不变。";
	}
	return "没有密钥时 webhook 端点会拒绝一切请求，状态同步不工作。填一段随机串，并在 Jira 的 webhook 配置里填同一串。";
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

/** 建 issue 时落在哪个项目、用哪个 issue 类型。 */
function JiraProjectFields(props: JiraFieldGroupProps) {
	return (
		<>
			<JiraTextField
				error={shown(props.submitted, props.errors.projectKey)}
				id={PROJECT_KEY_ID}
				label="project key"
				onValueChange={props.handlers.projectKey}
				pending={props.pending}
				placeholder="PAY"
				type="text"
				value={props.values.projectKey}
			/>
			<JiraTextField
				error={shown(props.submitted, props.errors.defaultIssueType)}
				id={ISSUE_TYPE_ID}
				label="默认 issue 类型"
				onValueChange={props.handlers.defaultIssueType}
				pending={props.pending}
				placeholder="Bug"
				type="text"
				value={props.values.defaultIssueType}
			/>
		</>
	);
}

/**
 * 回调地址与它的密钥。地址由服务端给出路径、这里拼上 origin，只在已经存过
 * 配置时才显示：没有配置就没有 webhookPath，凭空拼一条地址给人去 Jira 里填，
 * 填完的每一次投递都会 404。
 *
 * 「清空」按钮只在库里确实有密钥时才挂上去（`onToggleClear` 给 undefined 时
 * 字段自己不渲染按钮）：没东西可清时给一颗死按钮只会让人以为出了错。
 */
function JiraWebhookFields(props: JiraFieldGroupProps) {
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
