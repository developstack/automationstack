import type { AdfDocument } from "./adf";
import {
	classifyStatus,
	classifyThrown,
	type JiraResult,
	readErrorMessage,
} from "./failure";
import { buildIssueUrl, normalizeSiteUrl } from "./issue-key";

/**
 * Jira Cloud REST API v3 客户端。
 *
 * **纯外部服务客户端：不认识数据库，也不认识测试任务。** 它只知道站点地址、
 * 一组凭据和 issue 的形状。这样它既能用「库里存的配置」构造，也能用
 * 「用户在表单里刚填、还没保存的值」构造——`testConnection` 要的正是后者
 * （填错了想先测再存是常态）。
 *
 * 认证走 Basic Auth：`Authorization: Basic base64(email:apiToken)`，
 * 这是 Jira Cloud 对 API Token 唯一支持的方式（不是 Bearer）。
 *
 * 所有失败都是**类型化返回值而不是异常**。理由是 D9 的延伸：Jira 挂了、
 * 凭据过期了、网络断了，都不该让测试任务的操作跟着挂——调用方要能把
 * 「issue 没建成」和「结论没记上」分开处理。异常会把这两件事混成一个 500。
 */

/** 单次请求的超时。Jira Cloud 正常在 1s 内返回，10s 还没回基本就是挂了。 */
const REQUEST_TIMEOUT_MS = 10_000;

export interface JiraIssueRef {
	key: string;
	url: string;
}

export interface JiraIssue {
	key: string;
	/** issue 当前状态名，如 "Done"。Jira 的状态是项目可自定义的自由文本。 */
	status: string | null;
	summary: string | null;
	url: string;
}

export interface JiraConnectionInfo {
	/** 认证账号的显示名，用来让管理员确认「测通的是我以为的那个账号」。 */
	accountDisplayName: string | null;
	projectName: string | null;
}

export interface JiraCredentials {
	apiToken: string;
	email: string;
	projectKey: string;
	siteUrl: string;
}

export interface CreateIssueInput {
	description: AdfDocument;
	issueType: string;
	summary: string;
}

interface JiraRequestOptions {
	body?: unknown;
	method: "GET" | "POST";
	path: string;
}

function readString(
	source: Record<string, unknown>,
	key: string
): string | null {
	const value = source[key];
	return typeof value === "string" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

/**
 * Basic 凭据编码。
 *
 * 用 `btoa` 而不是 `Buffer`：与 `packages/db/src/secret-box.ts` 同理，
 * 这一层不引入 node 专有 API。email 与 token 都是 ASCII，不需要处理多字节。
 */
function encodeBasicAuth(email: string, apiToken: string): string {
	return btoa(`${email}:${apiToken}`);
}

export interface JiraClient {
	createIssue: (input: CreateIssueInput) => Promise<JiraResult<JiraIssueRef>>;
	/** 默认 issue type，正向创建时用。 */
	readonly defaultIssueType: string;
	getIssue: (issueKey: string) => Promise<JiraResult<JiraIssue>>;
	/** 组装 issue 的浏览地址，供调用方回填 `defectUrl`。 */
	issueUrl: (issueKey: string) => string;
	readonly projectKey: string;
	/** 连通性自检：验证凭据可用，且配的 project key 确实存在。 */
	verifyConnection: () => Promise<JiraResult<JiraConnectionInfo>>;
}

export interface CreateJiraClientOptions extends JiraCredentials {
	defaultIssueType?: string;
}

/** 未显式配置时的 issue type，与 `jira_configs.default_issue_type` 的默认值一致。 */
const FALLBACK_ISSUE_TYPE = "Bug";

export function createJiraClient(options: CreateJiraClientOptions): JiraClient {
	const siteUrl = normalizeSiteUrl(options.siteUrl);
	const authorization = `Basic ${encodeBasicAuth(options.email, options.apiToken)}`;

	async function request<T>(
		requestOptions: JiraRequestOptions,
		parse: (payload: unknown) => T | null
	): Promise<JiraResult<T>> {
		let response: Response;
		try {
			response = await fetch(`${siteUrl}${requestOptions.path}`, {
				body:
					requestOptions.body === undefined
						? undefined
						: JSON.stringify(requestOptions.body),
				headers: {
					accept: "application/json",
					authorization,
					"content-type": "application/json",
				},
				method: requestOptions.method,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
		} catch (error) {
			return { failure: classifyThrown(error), ok: false };
		}
		// 站点地址填错时 Jira 可能返回 HTML 登录页，JSON 解析会炸——
		// 先兜住，再按 HTTP 状态分类，而不是让解析异常冒到调用方。
		let payload: unknown = null;
		try {
			payload = await response.json();
		} catch {
			payload = null;
		}
		if (!response.ok) {
			return {
				failure: {
					kind: classifyStatus(response.status),
					message: readErrorMessage(payload),
				},
				ok: false,
			};
		}
		const value = parse(payload);
		if (value === null) {
			return {
				failure: { kind: "invalid-response", message: null },
				ok: false,
			};
		}
		return { ok: true, value };
	}

	function issueUrl(issueKey: string): string {
		return buildIssueUrl(siteUrl, issueKey);
	}

	return {
		createIssue(input) {
			return request(
				{
					body: {
						fields: {
							description: input.description,
							issuetype: { name: input.issueType },
							project: { key: options.projectKey },
							summary: input.summary,
						},
					},
					method: "POST",
					path: "/rest/api/3/issue",
				},
				(payload) => {
					const record = asRecord(payload);
					const key = record === null ? null : readString(record, "key");
					return key === null ? null : { key, url: issueUrl(key) };
				}
			);
		},

		defaultIssueType: options.defaultIssueType ?? FALLBACK_ISSUE_TYPE,

		getIssue(issueKey) {
			return request(
				{
					method: "GET",
					// 只取需要的两个字段：默认返回整个 issue（含全部自定义字段），
					// 大项目里能到几百 KB，而这里只要标题和状态。
					path: `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status`,
				},
				(payload) => {
					const record = asRecord(payload);
					const key = record === null ? null : readString(record, "key");
					if (record === null || key === null) {
						return null;
					}
					const fields = asRecord(record.fields);
					const status = fields === null ? null : asRecord(fields.status);
					return {
						key,
						status: status === null ? null : readString(status, "name"),
						summary: fields === null ? null : readString(fields, "summary"),
						url: issueUrl(key),
					};
				}
			);
		},

		issueUrl,

		projectKey: options.projectKey,

		async verifyConnection() {
			// 两步：先证明凭据有效（/myself），再证明 project key 存在且可见。
			// 只查其一都会漏掉一半的配置错误，而这正是自检要回答的问题。
			const me = await request(
				{ method: "GET", path: "/rest/api/3/myself" },
				(payload) => {
					const record = asRecord(payload);
					return record === null
						? null
						: { displayName: readString(record, "displayName") };
				}
			);
			if (!me.ok) {
				return me;
			}
			const project = await request(
				{
					method: "GET",
					path: `/rest/api/3/project/${encodeURIComponent(options.projectKey)}`,
				},
				(payload) => {
					const record = asRecord(payload);
					return record === null ? null : { name: readString(record, "name") };
				}
			);
			if (!project.ok) {
				return project;
			}
			return {
				ok: true,
				value: {
					accountDisplayName: me.value.displayName,
					projectName: project.value.name,
				},
			};
		},
	};
}
