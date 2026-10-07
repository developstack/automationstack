import type { JiraConfigView } from "@automationstack/api/routers/jira";

export const MASKED_SECRET_PLACEHOLDER = "••••••••••••";

export interface JiraFormValues {
	apiToken: string;
	clearWebhookSecret: boolean;
	defaultIssueType: string;
	email: string;
	projectKey: string;
	siteUrl: string;
	webhookSecret: string;
}

export interface JiraSaveInput {
	apiToken?: string;
	defaultIssueType: string;
	email: string;
	projectId: string;
	projectKey: string;
	siteUrl: string;
	webhookSecret?: string | null;
}

export interface JiraTestCredentials {
	apiToken?: string;
	email: string;
	projectKey: string;
	siteUrl: string;
}

export interface JiraFieldErrors {
	apiToken: string | null;
	defaultIssueType: string | null;
	email: string | null;
	projectKey: string | null;
	siteUrl: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRAILING_SLASHES_PATTERN = /\/+$/;

export function initialJiraFormValues(
	config: JiraConfigView | null
): JiraFormValues {
	return {
		apiToken: "",
		clearWebhookSecret: false,
		defaultIssueType: config?.defaultIssueType ?? "",
		email: config?.email ?? "",
		projectKey: config?.projectKey ?? "",
		siteUrl: config?.siteUrl ?? "",
		webhookSecret: "",
	};
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function validateSiteUrl(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === "") {
		return "站点 URL 必填，例如 https://your-team.atlassian.net";
	}
	if (!isHttpUrl(trimmed)) {
		return "请填写完整的 http(s) 地址，例如 https://your-team.atlassian.net";
	}
	return null;
}

function validateEmail(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === "") {
		return "邮箱必填：它与 API Token 成对构成 Jira 的基本认证凭据。";
	}
	return EMAIL_PATTERN.test(trimmed) ? null : "请填写合法的邮箱地址。";
}

function validateRequired(value: string, message: string): string | null {
	return value.trim() === "" ? message : null;
}

export function validateJiraForm(
	values: JiraFormValues,
	hasStoredApiToken: boolean
): JiraFieldErrors {
	return {
		apiToken:
			hasStoredApiToken || values.apiToken.trim() !== ""
				? null
				: "首次配置必须填写 API Token。",
		defaultIssueType: validateRequired(
			values.defaultIssueType,
			"默认 issue 类型必填，例如 Bug。"
		),
		email: validateEmail(values.email),
		projectKey: validateRequired(
			values.projectKey,
			"project key 必填，例如 PAY。"
		),
		siteUrl: validateSiteUrl(values.siteUrl),
	};
}

export function hasJiraFieldError(errors: JiraFieldErrors): boolean {
	return Object.values(errors).some((message) => message !== null);
}

export function hasJiraCredentialError(errors: JiraFieldErrors): boolean {
	return (
		errors.email !== null ||
		errors.projectKey !== null ||
		errors.siteUrl !== null
	);
}

export function toJiraSaveInput(
	values: JiraFormValues,
	projectId: string
): JiraSaveInput {
	const base: JiraSaveInput = {
		defaultIssueType: values.defaultIssueType.trim(),
		email: values.email.trim(),
		projectId,
		projectKey: values.projectKey.trim(),
		siteUrl: values.siteUrl.trim(),
	};
	const apiToken = values.apiToken.trim();
	if (apiToken !== "") {
		base.apiToken = apiToken;
	}
	if (values.clearWebhookSecret) {
		base.webhookSecret = null;
		return base;
	}
	const webhookSecret = values.webhookSecret.trim();
	if (webhookSecret !== "") {
		base.webhookSecret = webhookSecret;
	}
	return base;
}

export function toJiraTestCredentials(
	values: JiraFormValues
): JiraTestCredentials {
	const credentials: JiraTestCredentials = {
		email: values.email.trim(),
		projectKey: values.projectKey.trim(),
		siteUrl: values.siteUrl.trim(),
	};
	const apiToken = values.apiToken.trim();
	if (apiToken !== "") {
		credentials.apiToken = apiToken;
	}
	return credentials;
}

export function buildJiraWebhookUrl(
	serverOrigin: string,
	webhookPath: string
): string {
	return `${serverOrigin.trim().replace(TRAILING_SLASHES_PATTERN, "")}${webhookPath}`;
}
