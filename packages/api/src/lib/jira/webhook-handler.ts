import { getJiraConfig } from "@automationstack/db/repositories/jira-repository";
import { updateDefectStatusByIssueKey } from "@automationstack/db/repositories/test-run-defects-repository";

import { realtimeBus } from "../../realtime/bus";
import type { RealtimeActor } from "../../realtime/protocol";
import { parseJiraWebhookPayload, verifyJiraWebhook } from "./webhook";

const JIRA_ACTOR: RealtimeActor = { clientId: "jira-webhook", name: "Jira" };

export type JiraWebhookOutcome =
	| { kind: "ignored" }
	| { kind: "invalid-payload" }
	| { kind: "synced"; issueKey: string; status: string }
	| { kind: "unauthorized" }
	| { kind: "unconfigured" };

export interface HandleJiraWebhookInput {
	projectId: string;
	rawBody: string;
	secretHeader: string | null;
	signatureHeader: string | null;
}

export async function handleJiraWebhook(
	input: HandleJiraWebhookInput
): Promise<JiraWebhookOutcome> {
	const config = await getJiraConfig(input.projectId);
	if (config === null) {
		return { kind: "unconfigured" };
	}
	const authorized = await verifyJiraWebhook({
		rawBody: input.rawBody,
		secret: config.webhookSecret,
		secretHeader: input.secretHeader,
		signatureHeader: input.signatureHeader,
	});
	if (!authorized) {
		return { kind: "unauthorized" };
	}
	let payload: unknown;
	try {
		payload = JSON.parse(input.rawBody);
	} catch {
		return { kind: "invalid-payload" };
	}
	const event = parseJiraWebhookPayload(payload);
	if (event.kind !== "status") {
		return event.kind === "ignored"
			? { kind: "ignored" }
			: { kind: "invalid-payload" };
	}
	const touched = await updateDefectStatusByIssueKey(
		input.projectId,
		event.issueKey,
		event.status
	);
	const runIds = [...new Set(touched.map((row) => row.runId))];
	if (runIds.length > 0) {
		realtimeBus.publish(input.projectId, {
			action: "update",
			actor: JIRA_ACTOR,
			entity: "testRun",
			ids: runIds,
		});
	}
	return { issueKey: event.issueKey, kind: "synced", status: event.status };
}
