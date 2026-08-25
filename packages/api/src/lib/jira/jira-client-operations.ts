import type {
	CreateIssueInput,
	JiraConnectionInfo,
	JiraIssue,
	JiraIssueRef,
} from "./client";
import type { JiraResult } from "./failure";
import { type JiraTransport, sendJiraRequest } from "./jira-client-request";

/**
 * Jira Cloud REST v3 的**三个端点各一个自由函数**：建 issue、读 issue、自检。
 *
 * 从 `./client.ts` 的闭包里搬出来，凭据不再是「捕获到的变量」而是显式的
 * `JiraTransport` 参数——于是每个函数打哪个路径、要哪些输入、返回什么形状，
 * 全在它自己的签名里写着，不必先读一遍 `createJiraClient` 才知道。
 *
 * 类型定义仍留在 `./client.ts`（那里才是这套东西的门面），这边只 `import type`，
 * 类型导入会被编译期抹掉，因此两个文件之间**没有运行时循环依赖**。
 */

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
 * `issueUrl` 由调用方注入而不是在这里现拼：URL 的拼法归 `./issue-key.ts` 管，
 * 且 `JiraClient.issueUrl` 本身也要对外暴露同一个函数——传进来才能保证
 * 「返回值里的 url」和「调用方自己拼的 url」永远是同一套规则。
 */
export interface CreateJiraIssueParams {
	input: CreateIssueInput;
	issueUrl: (issueKey: string) => string;
	projectKey: string;
}

export function createJiraIssue(
	transport: JiraTransport,
	params: CreateJiraIssueParams
): Promise<JiraResult<JiraIssueRef>> {
	return sendJiraRequest(
		transport,
		{
			body: {
				fields: {
					description: params.input.description,
					issuetype: { name: params.input.issueType },
					project: { key: params.projectKey },
					summary: params.input.summary,
				},
			},
			method: "POST",
			path: "/rest/api/3/issue",
		},
		(payload) => {
			const record = asRecord(payload);
			const key = record === null ? null : readString(record, "key");
			return key === null ? null : { key, url: params.issueUrl(key) };
		}
	);
}

export function fetchJiraIssue(
	transport: JiraTransport,
	issueUrl: (issueKey: string) => string,
	issueKey: string
): Promise<JiraResult<JiraIssue>> {
	return sendJiraRequest(
		transport,
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
}

export async function verifyJiraConnection(
	transport: JiraTransport,
	projectKey: string
): Promise<JiraResult<JiraConnectionInfo>> {
	// 两步：先证明凭据有效（/myself），再证明 project key 存在且可见。
	// 只查其一都会漏掉一半的配置错误，而这正是自检要回答的问题。
	const me = await sendJiraRequest(
		transport,
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
	const project = await sendJiraRequest(
		transport,
		{
			method: "GET",
			path: `/rest/api/3/project/${encodeURIComponent(projectKey)}`,
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
}
