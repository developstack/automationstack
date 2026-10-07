import {
	JIRA_SECRET_HEADER,
	JIRA_SIGNATURE_HEADER,
	JIRA_WEBHOOK_ROUTE,
} from "@automationstack/api/lib/jira/webhook";
import { handleJiraWebhook } from "@automationstack/api/lib/jira/webhook-handler";
import type { Hono } from "hono";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

const REJECTED_BODY = { error: "rejected" } as const;

export function registerJiraWebhook(app: Hono): void {
	app.post(JIRA_WEBHOOK_ROUTE, async (c) => {
		const projectId = c.req.param("projectId");
		if (!UUID_PATTERN.test(projectId)) {
			return c.json(REJECTED_BODY, HTTP_UNAUTHORIZED);
		}
		const rawBody = await c.req.text();
		const outcome = await handleJiraWebhook({
			projectId,
			rawBody,
			secretHeader: c.req.header(JIRA_SECRET_HEADER) ?? null,
			signatureHeader: c.req.header(JIRA_SIGNATURE_HEADER) ?? null,
		});
		switch (outcome.kind) {
			case "invalid-payload":
				return c.json({ error: "invalid payload" }, HTTP_BAD_REQUEST);
			case "synced":
				return c.json({ status: "synced" });
			case "ignored":
				return c.json({ status: "ignored" });
			default:
				return c.json(REJECTED_BODY, HTTP_UNAUTHORIZED);
		}
	});
}
