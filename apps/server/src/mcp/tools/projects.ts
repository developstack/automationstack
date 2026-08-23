import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { type ApiClient, jsonResult, safeToolCall } from "./tool-helpers";

const LIST_PROJECTS_DESCRIPTION =
	"List all projects on the test-case platform (id, name, description, timestamps). " +
	"Call this first when migrating test cases and prefer reusing an existing project " +
	"over creating a new one.";

const CREATE_PROJECT_DESCRIPTION =
	"Create a new project on the test-case platform and return it (including its id). " +
	"Only use this after list_projects shows no suitable existing project and the user " +
	"has agreed to create one.";

const createProjectInput = {
	description: z
		.string()
		.optional()
		.describe("Optional free-text project description."),
	name: z.string().min(1).describe("Project name (must be non-empty)."),
};

export function registerProjectTools(
	server: McpServer,
	client: ApiClient
): void {
	server.registerTool(
		"list_projects",
		{ description: LIST_PROJECTS_DESCRIPTION },
		() => safeToolCall(async () => jsonResult(await client.projects.list()))
	);
	server.registerTool(
		"create_project",
		{
			description: CREATE_PROJECT_DESCRIPTION,
			inputSchema: createProjectInput,
		},
		({ description, name }) =>
			safeToolCall(async () =>
				jsonResult(
					await client.projects.create({
						description: description ?? null,
						name,
					})
				)
			)
	);
}
