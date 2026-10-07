import type { JiraConfig } from "@automationstack/db/schema/integrations";
import { decryptSecret } from "@automationstack/db/secret-box";

import { createJiraClient, type JiraClient } from "./client";

export type JiraClientResolution =
	| { kind: "credentials-unavailable"; reason: JiraCredentialProblem }
	| { kind: "ok"; client: JiraClient }
	| { kind: "unconfigured" };

export type JiraCredentialProblem = "master-key-missing" | "undecryptable";

export async function resolveJiraClientFromConfig(
	config: JiraConfig | null,
	masterKey: string | undefined
): Promise<JiraClientResolution> {
	if (config === null) {
		return { kind: "unconfigured" };
	}
	if (!masterKey) {
		return { kind: "credentials-unavailable", reason: "master-key-missing" };
	}
	const decrypted = await decryptSecret(config.apiTokenCipher, masterKey);
	if (decrypted.kind === "invalid-key") {
		return { kind: "credentials-unavailable", reason: "master-key-missing" };
	}
	if (decrypted.kind !== "ok") {
		return { kind: "credentials-unavailable", reason: "undecryptable" };
	}
	return {
		client: createJiraClient({
			apiToken: decrypted.value,
			defaultIssueType: config.defaultIssueType,
			email: config.email,
			projectKey: config.projectKey,
			siteUrl: config.siteUrl,
		}),
		kind: "ok",
	};
}
