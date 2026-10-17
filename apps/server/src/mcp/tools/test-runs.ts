import { VOID_REASON_MAX_LENGTH } from "@automationstack/api/schemas/test-run";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { type ApiClient, jsonResult, safeToolCall } from "./tool-helpers";

const VOID_TEST_RUN_DESCRIPTION =
	"Void (作废) a test run that will not be finished, and return the voided run. " +
	"A voided run stays in the project as read-only history: no more verdicts, " +
	"added cases, edits, review or submit. Voiding is final and cannot be undone. " +
	"Only runs in pending_review, ready or in_progress can be voided; completed " +
	"and submitted runs cannot. Only the run's creator, a project owner or a " +
	"platform admin may void it. Confirm with the user before you call it. " +
	"The runId is the last path segment of the run's URL " +
	"(/projects/<projectId>/test-runs/<runId>).";

const voidTestRunInput = {
	reason: z
		.string()
		.max(VOID_REASON_MAX_LENGTH)
		.optional()
		.describe("Optional reason, shown on the run's detail page."),
	runId: z.uuid().describe("Id of the test run to void."),
};

export function registerTestRunTools(
	server: McpServer,
	client: ApiClient
): void {
	server.registerTool(
		"void_test_run",
		{ description: VOID_TEST_RUN_DESCRIPTION, inputSchema: voidTestRunInput },
		({ reason, runId }) =>
			safeToolCall(async () =>
				jsonResult(
					await client.testRuns.void({ reason: reason ?? null, runId })
				)
			)
	);
}
