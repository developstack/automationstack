/**
 * Jira 配置表单的值、校验与提交载荷。
 *
 * 单独拆出来的理由与 `provider-form-values.ts` 相同：两个密文字段各有一套
 * 「留空 = 不修改」的语义，而这正是最容易被后来的改动破坏的一处——把掩码串
 * 回写进 apiToken，库里存的就是一串圆点。集中在这里，才有一处可读的真相。
 */
import type { JiraConfigView } from "@automationstack/api/routers/jira";

/**
 * 已存有密文时输入框显示的掩码占位。
 *
 * **固定长度，且只当 placeholder、不当 value**：服务端只下发
 * `hasApiToken: boolean`，连长度都不给（见 `JiraConfigView` 的注释），
 * 所以任何「按真实长度画圆点」的做法都是在编故事。当 value 更糟——
 * 用户不动它就会把这串圆点当成新 Token 提交上去。
 */
export const MASKED_SECRET_PLACEHOLDER = "••••••••••••";

export interface JiraFormValues {
	/** 只活在内存里的一次性输入；留空 = 保持库里那份不变。 */
	apiToken: string;
	/** 显式清空 webhook 密钥（= 关掉状态同步）；与 webhookSecret 互斥。 */
	clearWebhookSecret: boolean;
	defaultIssueType: string;
	email: string;
	projectKey: string;
	siteUrl: string;
	/** 同 apiToken：留空 = 不修改。 */
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

/** 「用表单里还没保存的值测」时发给 `jira.testConnection` 的那一份。 */
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

/* 顶层常量：在循环或每次渲染里现造正则是白烧 CPU（performance/useTopLevelRegex）。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRAILING_SLASHES_PATTERN = /\/+$/;

/** 未配置 Jira 的项目走这一份：整张表单从空开始，不是错误状态（D9）。 */
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

/**
 * 表单校验。
 *
 * `hasStoredApiToken` 决定 Token 是不是必填：首次配置必须给（服务端
 * `upsertConfig` 会以 BAD_REQUEST 拒绝没有 Token 的新配置），已经配过则
 * 留空表示沿用。
 *
 * 这里**只校验必填与格式，不校验长度**：各字段的上限（Token 512、邮箱 254 等）
 * 是 `packages/api/src/routers/jira.ts` 里的模块私有常量，没有导出，前端复刻
 * 一份就等于开第二处真相。超长交给服务端 zod 报错。
 */
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

/**
 * 「测试连接」只需要凭据三件套。
 *
 * 与保存分开判定是有意的：默认 issue 类型只在建 issue 时才用得上，
 * 而 API Token 留空时服务端会拿库里那份补上——为了这两个字段拦下一次自检，
 * 等于逼人先把表单填完整才允许试错，而试错正是这颗按钮存在的理由。
 */
export function hasJiraCredentialError(errors: JiraFieldErrors): boolean {
	return (
		errors.email !== null ||
		errors.projectKey !== null ||
		errors.siteUrl !== null
	);
}

/**
 * 组装保存载荷。两个密文字段的三条路径摊开写，不用带可选键的对象字面量拼：
 * 「什么时候不带这个字段」是本表单最要紧的语义，摊开才看得见。
 */
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
		// null 而不是 undefined：服务端的三态里，null 才是「清空」。
		base.webhookSecret = null;
		return base;
	}
	const webhookSecret = values.webhookSecret.trim();
	if (webhookSecret !== "") {
		base.webhookSecret = webhookSecret;
	}
	return base;
}

/**
 * 连通性自检用的凭据。Token 留空时**整个键都不带**，服务端会拿库里那份
 * 补上——「改了 project key 想先测一下」不该逼人把 Token 再打一遍。
 */
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

/**
 * 拼出管理员要填进 Jira 的完整 webhook 地址。
 *
 * 服务端只给路径（`/api/jira/webhook/<projectId>`），因为它不知道自己被反代
 * 到了哪个域名——`CORS_ORIGIN` 是**前端**地址，拿它拼出来的必然是错的。
 *
 * origin 由调用方给。传 `VITE_SERVER_URL` 而不是 `window.location.origin`：
 * webhook 端点长在 `apps/server`（dev 是 :3000），设置页长在 `apps/web`
 * （dev 是 :3001），照搬浏览器地址栏会给出一个指向前端的死地址。
 * `VITE_SERVER_URL` 正是「浏览器该去哪里找这个后端」——RPC 客户端用的就是它，
 * 页面能打开就说明这个地址是通的。同域反代时两者本来就相等。
 *
 * ⚠️ 它仍然只保证「浏览器能到达」，不保证「Jira Cloud 从公网能到达」：
 * localhost 是谁都到不了的，所以文案里要提醒这一点。
 */
export function buildJiraWebhookUrl(
	serverOrigin: string,
	webhookPath: string
): string {
	return `${serverOrigin.trim().replace(TRAILING_SLASHES_PATTERN, "")}${webhookPath}`;
}
