import { getJiraConfig } from "@automationstack/db/repositories/jira-repository";
import { encryptSecret } from "@automationstack/db/secret-box";
import { env } from "@automationstack/env/server";

import { createJiraClient, type JiraClient } from "./client";
import {
	type JiraClientResolution,
	resolveJiraClientFromConfig,
} from "./resolve-client";

export async function resolveJiraClient(
	projectId: string
): Promise<JiraClientResolution> {
	const config = await getJiraConfig(projectId);
	return await resolveJiraClientFromConfig(config, env.SECRET_ENCRYPTION_KEY);
}

export async function getJiraClient(
	projectId: string
): Promise<JiraClient | null> {
	const resolution = await resolveJiraClient(projectId);
	return resolution.kind === "ok" ? resolution.client : null;
}

export interface JiraFormCredentials {
	apiToken?: string;
	email: string;
	projectKey: string;
	siteUrl: string;
}

export async function resolveJiraClientForForm(
	projectId: string,
	form?: JiraFormCredentials
): Promise<JiraClientResolution> {
	if (form === undefined) {
		return await resolveJiraClient(projectId);
	}
	if (form.apiToken !== undefined && form.apiToken !== "") {
		return {
			client: createJiraClient({
				apiToken: form.apiToken,
				email: form.email,
				projectKey: form.projectKey,
				siteUrl: form.siteUrl,
			}),
			kind: "ok",
		};
	}
	const config = await getJiraConfig(projectId);
	if (config === null) {
		return { kind: "unconfigured" };
	}
	return await resolveJiraClientFromConfig(
		{
			...config,
			email: form.email,
			projectKey: form.projectKey,
			siteUrl: form.siteUrl,
		},
		env.SECRET_ENCRYPTION_KEY
	);
}

export type EncryptApiTokenResult =
	| { kind: "master-key-missing" }
	| { kind: "ok"; cipher: string };

export async function encryptJiraApiToken(
	apiToken: string
): Promise<EncryptApiTokenResult> {
	const masterKey = env.SECRET_ENCRYPTION_KEY;
	if (!masterKey) {
		return { kind: "master-key-missing" };
	}
	const encrypted = await encryptSecret(apiToken, masterKey);
	if (encrypted.kind !== "ok") {
		return { kind: "master-key-missing" };
	}
	return { cipher: encrypted.box, kind: "ok" };
}

export function isSecretStorageAvailable(): boolean {
	return env.SECRET_ENCRYPTION_KEY !== undefined;
}
