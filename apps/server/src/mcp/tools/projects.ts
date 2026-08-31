import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { type ApiClient, jsonResult, safeToolCall } from "./tool-helpers";

const LIST_PROJECTS_DESCRIPTION =
	"List the projects the caller can reach on the test-case platform (id, name, " +
	"description, timestamps). Call it first in any test-case task — writing cases " +
	"or migrating them — both to pick the target project and because a successful " +
	"call is the proof that the connection and the API token work. Prefer reusing " +
	"an existing project over creating one. The project's description is free text " +
	"the team maintains; read it, it often states the project's own conventions.";

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
