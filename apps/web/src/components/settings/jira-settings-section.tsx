/**
 * 「Jira 集成」分区。
 *
 * **未配置是绝大多数项目的正常状态**（plan §5.1 / D9）：这一节此时展示一张
 * 空表单，不报错、不出现异常态、也不影响页面其它任何部分。服务端为此把
 * 「没配」与「配了但解不开」在类型上分成了两件事，这里照着分开渲染——
 * 把前者也画成红条，等于告诉每一个没接 Jira 的团队他们坏了。
 */
import type { JiraConfigState } from "@automationstack/api/routers/jira";
import { env } from "@automationstack/env/web";
import { Button } from "@automationstack/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { useCallback } from "react";

import { JiraConnectionResult } from "@/components/settings/jira-connection-result";
import {
	JiraSecretField,
	JiraTextField,
} from "@/components/settings/jira-fields";
import {
	buildJiraWebhookUrl,
	type JiraFormValues,
	MASKED_SECRET_PLACEHOLDER,
} from "@/components/settings/jira-form-values";
import { JiraWebhookUrl } from "@/components/settings/jira-webhook-url";
import {
	SettingsFieldsSkeleton,
	SettingsSection,
	SettingsSectionError,
} from "@/components/settings/settings-section";
import { useJiraConfigForm } from "@/components/settings/use-jira-config-form";
import { orpc } from "@/utils/orpc";

const HEADING_ID = "settings-jira-heading";
const SECTION_TITLE = "Jira 集成";
const SECTION_DESCRIPTION =
	"配置后，失败用例可一键建 issue、粘贴链接反向关联，并由 webhook 同步 issue 状态。未配置也不影响测试任务的任何功能。";

/** 骨架占位：站点 / 邮箱 / Token / project key / issue 类型。 */
const FIELD_COUNT = 5;

const SITE_URL_ID = "settings-jira-site-url";
const EMAIL_ID = "settings-jira-email";
const API_TOKEN_ID = "settings-jira-api-token";
const PROJECT_KEY_ID = "settings-jira-project-key";
const ISSUE_TYPE_ID = "settings-jira-issue-type";
const WEBHOOK_SECRET_ID = "settings-jira-webhook-secret";

function CredentialProblemNotice({ reason }: { reason: string }) {
	const detail =
		reason === "master-key-missing"
			? "服务端未配置 SECRET_ENCRYPTION_KEY，已存的 API Token 解不开。补上该环境变量后即可恢复，数据没有损坏。"
			: "已存的 API Token 解不开——主密钥被换过了，旧密文找不回来。请重新填写一次 API Token 并保存。";

	return (
		// role="status" 而不是 alert：它一进页面就在那儿，不是刚刚发生的事
		<div
			className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			role="status"
		>
			<TriangleAlertIcon
				aria-hidden="true"
				className="mt-0.5 size-4 shrink-0"
			/>
			<div className="flex flex-col gap-1">
				<p className="font-medium">当前 Jira 凭据不可用</p>
				<p>{detail}</p>
			</div>
		</div>
	);
}

/** 五个 onChange 都要稳定引用：JSX 上现造闭包会让每次输入都重挂控件。 */
function useFieldHandlers(patch: (next: Partial<JiraFormValues>) => void) {
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

function JiraConfigFormView({
	projectId,
	state,
}: {
	projectId: string;
	state: JiraConfigState;
}) {
	const form = useJiraConfigForm(projectId, state);
	const handlers = useFieldHandlers(form.patch);
	const { errors, submitted, values } = form;
	// 提交过一次之后才标红；之前只做校验不显示
	const shown = (message: string | null) => (submitted ? message : null);
	const blocked = !state.secretStorageAvailable;

	return (
		// noValidate：原生校验气泡是英文的，跟这里的中文内联提示对不上
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			{state.credentialProblem === null ? null : (
				<CredentialProblemNotice reason={state.credentialProblem} />
			)}
			<JiraTextField
				error={shown(errors.siteUrl)}
				id={SITE_URL_ID}
				label="站点 URL"
				onValueChange={handlers.siteUrl}
				pending={form.pending}
				placeholder="https://your-team.atlassian.net"
				type="url"
				value={values.siteUrl}
			/>
			<JiraTextField
				error={shown(errors.email)}
				id={EMAIL_ID}
				label="邮箱"
				onValueChange={handlers.email}
				pending={form.pending}
				placeholder="you@example.com"
				type="email"
				value={values.email}
			/>
			<JiraSecretField
				error={shown(errors.apiToken)}
				hint={apiTokenHint(state)}
				id={API_TOKEN_ID}
				label="API Token"
				onValueChange={handlers.apiToken}
				pending={form.pending}
				placeholder={
					state.config?.hasApiToken === true
						? MASKED_SECRET_PLACEHOLDER
						: "粘贴 Atlassian 签发的 API Token"
				}
				storageBlocked={blocked}
				value={values.apiToken}
			/>
			<JiraTextField
				error={shown(errors.projectKey)}
				id={PROJECT_KEY_ID}
				label="project key"
				onValueChange={handlers.projectKey}
				pending={form.pending}
				placeholder="PAY"
				type="text"
				value={values.projectKey}
			/>
			<JiraTextField
				error={shown(errors.defaultIssueType)}
				id={ISSUE_TYPE_ID}
				label="默认 issue 类型"
				onValueChange={handlers.defaultIssueType}
				pending={form.pending}
				placeholder="Bug"
				type="text"
				value={values.defaultIssueType}
			/>
			{state.config === null ? null : (
				<JiraWebhookUrl
					url={buildJiraWebhookUrl(
						env.VITE_SERVER_URL,
						state.config.webhookPath
					)}
				/>
			)}
			<JiraSecretField
				clearRequested={values.clearWebhookSecret}
				error={null}
				hint={webhookSecretHint(state, values.clearWebhookSecret)}
				id={WEBHOOK_SECRET_ID}
				label="Webhook 密钥"
				onToggleClear={
					state.config?.hasWebhookSecret === true
						? form.toggleClearWebhookSecret
						: undefined
				}
				onValueChange={handlers.webhookSecret}
				pending={form.pending}
				placeholder={
					state.config?.hasWebhookSecret === true
						? MASKED_SECRET_PLACEHOLDER
						: "自己生成一段随机串"
				}
				storageBlocked={false}
				value={values.webhookSecret}
			/>
			{form.testResult === null ? null : (
				<JiraConnectionResult result={form.testResult} />
			)}
			<div className="flex justify-end gap-2">
				<Button
					disabled={form.pending || form.testPending}
					onClick={form.handleTest}
					type="button"
					variant="outline"
				>
					{form.testPending ? "测试中…" : "测试连接"}
				</Button>
				<Button disabled={form.pending} type="submit">
					{form.pending ? "保存中…" : "保存"}
				</Button>
			</div>
		</form>
	);
}

function JiraSettingsBody({ projectId }: { projectId: string }) {
	const configQuery = useQuery(
		orpc.jira.getConfig.queryOptions({ input: { projectId } })
	);
	const { refetch } = configQuery;
	const handleRetry = useCallback(() => {
		refetch();
	}, [refetch]);

	if (configQuery.isPending) {
		return <SettingsFieldsSkeleton fields={FIELD_COUNT} />;
	}
	// isPending 落下来还没有数据 = 这条查询失败了（全局 toast 已经报过一次）
	if (configQuery.data === undefined) {
		return <SettingsSectionError onRetry={handleRetry} />;
	}
	return <JiraConfigFormView projectId={projectId} state={configQuery.data} />;
}

export function JiraSettingsSection({ projectId }: { projectId: string }) {
	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<JiraSettingsBody projectId={projectId} />
		</SettingsSection>
	);
}
