import {
	handleIngestAttachmentPresign,
	handleIngestAttachmentRegister,
	type IngestAttachmentPresignOutcome,
	type IngestAttachmentRegisterOutcome,
} from "@automationstack/api/lib/ingest/attachment-uploads";
import type { Hono } from "hono";

import {
	ingestBodyLimit,
	MAX_INGEST_ATTACHMENT_BODY_BYTES,
} from "./body-limit";
import {
	forbidden,
	INVALID_JSON_MESSAGE,
	invalidPayload,
	parseJsonBody,
	projectNotFound,
	unauthorized,
	unhandledOutcome,
} from "./responses";
import {
	INGEST_ATTACHMENTS_PRESIGN_ROUTE,
	INGEST_ATTACHMENTS_REGISTER_ROUTE,
} from "./route-paths";

function registerPresignRoute(app: Hono): void {
	app.post(
		INGEST_ATTACHMENTS_PRESIGN_ROUTE,
		ingestBodyLimit({
			advice: "附件本体不走这个端点（它只收元数据），请分批申请签名",
			maxSize: MAX_INGEST_ATTACHMENT_BODY_BYTES,
		}),
		async (c) => {
			const parsedBody = parseJsonBody(await c.req.text());
			if (parsedBody.kind !== "ok") {
				return invalidPayload(c, INVALID_JSON_MESSAGE);
			}
			const outcome: IngestAttachmentPresignOutcome =
				await handleIngestAttachmentPresign({
					authorizationHeader: c.req.header("authorization") ?? null,
					body: parsedBody.body,
				});
			switch (outcome.kind) {
				case "forbidden":
					return forbidden(c);
				case "invalid-payload":
					return invalidPayload(c, outcome.message);
				case "ok":
					return c.json(outcome.receipt);
				case "project-not-found":
					return projectNotFound(c);
				case "unauthorized":
					return unauthorized(c);
				default:
					return unhandledOutcome(outcome);
			}
		}
	);
}

function registerRegisterRoute(app: Hono): void {
	app.post(
		INGEST_ATTACHMENTS_REGISTER_ROUTE,
		ingestBodyLimit({
			advice: "附件本体不走这个端点（它只收元数据），请分批登记",
			maxSize: MAX_INGEST_ATTACHMENT_BODY_BYTES,
		}),
		async (c) => {
			const parsedBody = parseJsonBody(await c.req.text());
			if (parsedBody.kind !== "ok") {
				return invalidPayload(c, INVALID_JSON_MESSAGE);
			}
			const outcome: IngestAttachmentRegisterOutcome =
				await handleIngestAttachmentRegister({
					authorizationHeader: c.req.header("authorization") ?? null,
					body: parsedBody.body,
				});
			switch (outcome.kind) {
				case "invalid-payload":
					return invalidPayload(c, outcome.message);
				case "ok":
					return c.json(outcome.receipt);
				case "unauthorized":
					return unauthorized(c);
				default:
					return unhandledOutcome(outcome);
			}
		}
	);
}

export function registerIngestAttachmentRoutes(app: Hono): void {
	registerPresignRoute(app);
	registerRegisterRoute(app);
}
