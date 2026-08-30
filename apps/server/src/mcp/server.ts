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

const MCP_SERVER_INFO = { name: "testcase-platform", version: "0.1.0" };

/** 204 No Content: transport handled the request without a body to return. */
const HTTP_NO_CONTENT = 204;

const HTTP_UNAUTHORIZED = 401;

/**
 * 401 必须带 `WWW-Authenticate`，与 ingest 那条通道同一个理由
 * （`ingest/responses.ts` 里写全了）：这是 401 的语义要求，也是客户端区分
 * 「凭据没通过」与「随便一个 4xx」的依据。
 *
 * 不共用 `ingest/responses.ts` 的那个函数：那个文件的文件头写明它是
 * **ingest 搬运层共用的**应答零件，四条端点对同一种失败必须说同一句话。
 * MCP 不是那四条里的一条，从这里伸手过去会让那句话悄悄多一个调用方，
 * 日后改 ingest 的文案就会莫名其妙地改到 MCP。
 */
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
	return server;
}

/**
 * Stateless Streamable HTTP endpoint (plan §6): every request gets a
 * fresh McpServer + transport pair, and tools call oRPC procedures
 * in-process via createRouterClient, so validation and the snapshot
 * pipeline apply exactly as they do for /rpc traffic.
 *
 * 鉴权在建 server **之前**：认不出人就一个工具都不注册，也就不存在
 * 「先跑起来再在每个工具里判一次」那种漏一个就是一个洞的形状。
 * 身份怎么来的、为什么必须是真人，全写在 `./identity`。
 */
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
