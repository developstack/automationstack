import type { AdfDocument } from "./adf";
import type { JiraResult } from "./failure";
import { buildIssueUrl, normalizeSiteUrl } from "./issue-key";
import {
	createJiraIssue,
	fetchJiraIssue,
	verifyJiraConnection,
} from "./jira-client-operations";
import { encodeBasicAuth, type JiraTransport } from "./jira-client-request";

export interface JiraIssueRef {
	key: string;
	url: string;
}

export interface JiraIssue {
	key: string;
	status: string | null;
	summary: string | null;
	url: string;
}

export interface JiraConnectionInfo {
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
	readonly defaultIssueType: string;
	getIssue: (issueKey: string) => Promise<JiraResult<JiraIssue>>;
	issueUrl: (issueKey: string) => string;
	readonly projectKey: string;
	verifyConnection: () => Promise<JiraResult<JiraConnectionInfo>>;
}

export interface CreateJiraClientOptions extends JiraCredentials {
	defaultIssueType?: string;
}

const FALLBACK_ISSUE_TYPE = "Bug";

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
