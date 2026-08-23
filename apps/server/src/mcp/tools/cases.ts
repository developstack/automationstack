import {
	importBatchSchema,
	searchCasesSchema,
} from "@automationstack/api/routers/case-import";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { type ApiClient, jsonResult, safeToolCall } from "./tool-helpers";

const IMPORT_TEST_CASES_DESCRIPTION =
	"Bulk-import test cases into a project (at most 50 per call; split larger sets " +
	"into batches). Each case needs a moduleId obtained via ensure_module_path, a " +
	"name, and should carry a stable sourceRef (unique per project) so re-runs are " +
	"idempotent. Case fields: priority P0-P3 (default P2), caseType " +
	"functional|interface|performance|security|compatibility|other, status " +
	"draft|active|deprecated, preconditions, steps [{id, step, expected}] (id must " +
	"be a unique string, e.g. a uuid), tags, maintainer. onDuplicate controls what " +
	"happens when a sourceRef already exists: 'skip' leaves the existing case " +
	"untouched, 'overwrite' updates it through the version-snapshot pipeline (a new " +
	"version is recorded), 'create-anyway' creates a new case but with sourceRef " +
	"set to null (the unique index forbids duplicates). Rows without sourceRef are " +
	"skipped with a warning when a same-name case already exists in the target " +
	"module. Rows are validated and processed independently: a row that is " +
	"malformed (missing/empty name, moduleId not a uuid, unknown enum value, …) " +
	"or that fails to execute is reported in 'errors' with its index in the " +
	"batch and a message naming the offending field — it never rejects the " +
	"other rows, so dirty legacy data can be submitted as-is and repaired from " +
	"the report. Result: {created[] (action created|overwritten, caseId, " +
	"version), skipped[], errors[] (index, name, sourceRef, message)}.";

const SEARCH_CASES_DESCRIPTION =
	"Search test cases in a project by a case-insensitive name substring " +
	"(%/_ are escaped literally). Returns up to 'limit' summary rows (id, name, " +
	"moduleId, priority, status, caseType, sourceRef, updatedAt), newest-updated " +
	"first. Use it after an import batch to spot-check that cases landed correctly.";

export function registerCaseTools(server: McpServer, client: ApiClient): void {
	server.registerTool(
		"import_test_cases",
		{
			description: IMPORT_TEST_CASES_DESCRIPTION,
			inputSchema: importBatchSchema,
		},
		(input) =>
			safeToolCall(async () =>
				jsonResult(await client.cases.importBatch(input))
			)
	);
	server.registerTool(
		"search_cases",
		{ description: SEARCH_CASES_DESCRIPTION, inputSchema: searchCasesSchema },
		(input) =>
			safeToolCall(async () => jsonResult(await client.cases.search(input)))
	);
}
