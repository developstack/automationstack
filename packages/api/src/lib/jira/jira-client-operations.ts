import type {
	CreateIssueInput,
	JiraConnectionInfo,
	JiraIssue,
	JiraIssueRef,
} from "./client";
import type { JiraResult } from "./failure";
import { type JiraTransport, sendJiraRequest } from "./jira-client-request";

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
