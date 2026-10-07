import {
	handleIngestExecution,
	handleIngestRuns,
	type IngestExecutionOutcome,
	type IngestRunsOutcome,
} from "@automationstack/api/lib/ingest/execution-ingest";
import type { Hono } from "hono";

import { ingestBodyLimit, MAX_INGEST_BODY_BYTES } from "./body-limit";
import {
	forbidden,
	HTTP_BAD_REQUEST,
	INVALID_JSON_MESSAGE,
	invalidPayload,
	parseJsonBody,
	projectNotFound,
	unauthorized,
	unhandledOutcome,
} from "./responses";
import { INGEST_EXECUTIONS_ROUTE, INGEST_RUNS_ROUTE } from "./route-paths";

function registerRunsRoute(app: Hono): void {
	app.get(INGEST_RUNS_ROUTE, async (c) => {
		const outcome: IngestRunsOutcome = await handleIngestRuns({
			authorizationHeader: c.req.header("authorization") ?? null,
			query: c.req.query(),
		});
		switch (outcome.kind) {
			case "forbidden":
				return forbidden(c);
			case "invalid-payload":
				return invalidPayload(c, outcome.message);
			case "ok":
				return c.json(outcome.response);
			case "project-not-found":
				return projectNotFound(c);
			case "unauthorized":
				return unauthorized(c);
			default:
				return unhandledOutcome(outcome);
		}
	});
}

function registerExecutionRoute(app: Hono): void {
	app.post(
		INGEST_EXECUTIONS_ROUTE,
		ingestBodyLimit({
			advice: "结果本身没有问题，请分批重发（SDK 建议每批 200 条）",
			maxSize: MAX_INGEST_BODY_BYTES,
		}),
		async (c) => {
			const parsedBody = parseJsonBody(await c.req.text());
			if (parsedBody.kind !== "ok") {
				return invalidPayload(c, INVALID_JSON_MESSAGE);
			}
			const outcome: IngestExecutionOutcome = await handleIngestExecution({
				authorizationHeader: c.req.header("authorization") ?? null,
				body: parsedBody.body,
			});
			switch (outcome.kind) {
				case "duplicate-source-refs":
					return c.json(
						{
							error: "duplicate-source-refs",
							message:
								"同一批结果里有重复的 sourceRef，整批未受理；请合并后重发",
							sourceRefs: outcome.sourceRefs,
						},
						HTTP_BAD_REQUEST
					);
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

export function registerIngestExecutionRoutes(app: Hono): void {
	registerRunsRoute(app);
	registerExecutionRoute(app);
}
