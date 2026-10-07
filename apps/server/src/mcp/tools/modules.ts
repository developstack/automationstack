import { ensurePathSchema } from "@automationstack/api/routers/modules";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { flattenWithCoverage, renderOutline } from "./module-coverage";
import {
	type ApiClient,
	JSON_INDENT,
	jsonResult,
	safeToolCall,
	type ToolResult,
} from "./tool-helpers";

const GET_MODULE_TREE_DESCRIPTION =
	"Get a project's module tree together with how much coverage each module " +
	"already has, in two representations: an indented human-readable outline and " +
	"a flat JSON list ({id, name, parentId, depth, caseCount, activeCaseCount, " +
	"gap}). Counts include the module's descendants, because cases usually hang " +
	"off leaf modules and an intermediate module is a folder. gap is 'empty' (no " +
	"cases at all in that subtree), 'no-active' (cases exist but none is active) " +
	"or null. " +
	"Call it before creating modules or writing cases: it says where a case " +
	"belongs (matching is by name, so existing modules get reused instead of " +
	"duplicated) and which parts of the project are uncovered, which is what " +
	"turns 'add some cases' into a decision about where. It does not return the " +
	"cases themselves — read_cases does that.";

const ENSURE_MODULE_PATH_DESCRIPTION =
	"Ensure a module path exists in a project, walking the given name path from the " +
	"root level and creating any missing segment. Idempotent: re-running with the " +
	"same path creates nothing new. Returns the deepest module's id (moduleId, use " +
	"it as the moduleId of imported cases) plus createdModuleIds for the segments " +
	"that were created by this call.";

async function getModuleTree(
	client: ApiClient,
	projectId: string
): Promise<ToolResult> {
	const [tree, coverage] = await Promise.all([
		client.modules.tree({ projectId }),
		client.projectStats.coverage({ projectId }),
	]);
	const flat = flattenWithCoverage(tree, coverage.modules);
	return {
		content: [
			{ text: renderOutline(flat), type: "text" },
			{ text: JSON.stringify(flat, null, JSON_INDENT), type: "text" },
		],
	};
}

export function registerModuleTools(
	server: McpServer,
	client: ApiClient
): void {
	server.registerTool(
		"get_module_tree",
		{
			description: GET_MODULE_TREE_DESCRIPTION,
			inputSchema: { projectId: z.uuid().describe("Project id.") },
		},
		({ projectId }) => safeToolCall(() => getModuleTree(client, projectId))
	);
	server.registerTool(
		"ensure_module_path",
		{
			description: ENSURE_MODULE_PATH_DESCRIPTION,
			inputSchema: ensurePathSchema,
		},
		(input) =>
			safeToolCall(async () =>
				jsonResult(await client.modules.ensurePath(input))
			)
	);
}
