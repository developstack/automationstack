import { env } from "@automationstack/env/server";

import type { JiraClient } from "./client";

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

const TRAILING_SLASHES_PATTERN = /\/+$/;

export interface DefectLinkView {
	defectKey: string | null;
	defectStatus: string | null;
	defectTitle: string | null;
	defectUrl: string | null;
}

export function normalizeExternalUrl(value: string): string | null {
	try {
		const url = new URL(value.trim());
		return ALLOWED_URL_PROTOCOLS.has(url.protocol) ? url.toString() : null;
	} catch {
		return null;
	}
}

export function buildRunUrl(projectId: string, runId: string): string {
	const origin = env.CORS_ORIGIN.replace(TRAILING_SLASHES_PATTERN, "");
	return `${origin}/projects/${projectId}/test-runs/${runId}`;
}

export async function readFreshStatus(
	client: JiraClient,
	issueKey: string
): Promise<string | null> {
	const issue = await client.getIssue(issueKey);
	return issue.ok ? issue.value.status : null;
}
