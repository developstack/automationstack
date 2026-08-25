import type { AdfDocument } from "./adf";
import type { JiraResult } from "./failure";
import { buildIssueUrl, normalizeSiteUrl } from "./issue-key";
import {
	createJiraIssue,
	fetchJiraIssue,
	verifyJiraConnection,
} from "./jira-client-operations";
import { encodeBasicAuth, type JiraTransport } from "./jira-client-request";

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

/**
 * 门面：把凭据折算成一个 `JiraTransport`，再把四个方法接到
 * `./jira-client-operations.ts` 的自由函数上。
 *
 * 这里**只做绑定，不含任何请求细节**——发请求在 `./jira-client-request.ts`，
 * 端点与返回体解析在 `./jira-client-operations.ts`。于是「这个客户端能干什么」
 * 一屏看得完，而 `JiraClient` 接口一改，缺哪个方法这里立刻编译不过。
 */
export function createJiraClient(options: CreateJiraClientOptions): JiraClient {
	const siteUrl = normalizeSiteUrl(options.siteUrl);
	const transport: JiraTransport = {
		authorization: `Basic ${encodeBasicAuth(options.email, options.apiToken)}`,
		siteUrl,
	};

	function issueUrl(issueKey: string): string {
		return buildIssueUrl(siteUrl, issueKey);
	}

	return {
		createIssue: (input) =>
			createJiraIssue(transport, {
				input,
				issueUrl,
				projectKey: options.projectKey,
			}),

		defaultIssueType: options.defaultIssueType ?? FALLBACK_ISSUE_TYPE,

		getIssue: (issueKey) => fetchJiraIssue(transport, issueUrl, issueKey),

		issueUrl,

		projectKey: options.projectKey,

		verifyConnection: () => verifyJiraConnection(transport, options.projectKey),
	};
}
