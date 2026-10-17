import { resolveUserFromBearer } from "@automationstack/api/auth/bearer";
import type { Context } from "@automationstack/api/context";
import { appRouter } from "@automationstack/api/routers/index";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRouterClient } from "@orpc/server";
import type { Context as HonoContext } from "hono";

import { mcpContext } from "./identity";
import { registerCaseTools } from "./tools/cases";
import { registerModuleTools } from "./tools/modules";
import { registerProjectTools } from "./tools/projects";
import { registerTestRunTools } from "./tools/test-runs";

const MCP_SERVER_INFO = { name: "testcase-platform", version: "0.1.0" };

const HTTP_NO_CONTENT = 204;

const HTTP_UNAUTHORIZED = 401;

function unauthorized(c: HonoContext): Response {
	return c.json(
		{
			error: "unauthorized",
			message:
				"MCP 通道需要 Authorization: Bearer <API Token>；身份与权限即该 token 所属用户的身份与权限",
		},
		HTTP_UNAUTHORIZED,
		{ "WWW-Authenticate": "Bearer" }
	);
}

function createMcpServer(context: Context): McpServer {
	const client = createRouterClient(appRouter, { context });
	const server = new McpServer(MCP_SERVER_INFO);
	registerProjectTools(server, client);
	registerModuleTools(server, client);
	registerCaseTools(server, client);
	registerTestRunTools(server, client);
	return server;
}

export async function handleMcpRequest(c: HonoContext): Promise<Response> {
	const user = await resolveUserFromBearer(c.req.header("authorization"));
	if (user === null) {
		return unauthorized(c);
	}
	const server = createMcpServer(
		mcpContext(user, c.req.url.startsWith("https://"))
	);
	const transport = new StreamableHTTPTransport();
	await server.connect(transport);
	const response = await transport.handleRequest(c);
	return response ?? c.body(null, HTTP_NO_CONTENT);
}
