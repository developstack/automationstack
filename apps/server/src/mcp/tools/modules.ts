import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { ensurePathSchema } from "@automationstack/api/routers/modules";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
	type ApiClient,
	JSON_INDENT,
	jsonResult,
	safeToolCall,
	type ToolResult,
} from "./tool-helpers";

const GET_MODULE_TREE_DESCRIPTION =
	"Get the full module tree of a project in two representations: an indented " +
	"human-readable outline and a flat JSON list ({id, name, parentId, depth}). " +
	"Use it before creating modules or importing cases, so existing modules are " +
	"reused instead of duplicated (matching is by name).";

const ENSURE_MODULE_PATH_DESCRIPTION =
	"Ensure a module path exists in a project, walking the given name path from the " +
	"root level and creating any missing segment. Idempotent: re-running with the " +
	"same path creates nothing new. Returns the deepest module's id (moduleId, use " +
	"it as the moduleId of imported cases) plus createdModuleIds for the segments " +
	"that were created by this call.";

interface FlatModule {
	depth: number;
	id: string;
	name: string;
	parentId: string | null;
}

function flattenModules(
	nodes: ModuleTreeNode[],
	depth: number,
	out: FlatModule[]
): FlatModule[] {
	for (const node of nodes) {
		out.push({
			depth,
			id: node.id,
			name: node.name,
			parentId: node.parentId,
		});
		flattenModules(node.children, depth + 1, out);
	}
	return out;
}

function renderOutline(flat: FlatModule[]): string {
	if (flat.length === 0) {
		return "(project has no modules yet)";
	}
	return flat
		.map((row) => `${"  ".repeat(row.depth)}- ${row.name} (id: ${row.id})`)
		.join("\n");
}

async function getModuleTree(
	client: ApiClient,
	projectId: string
): Promise<ToolResult> {
	const tree = await client.modules.tree({ projectId });
	const flat = flattenModules(tree, 0, []);
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
