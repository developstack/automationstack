import type { Context } from "@automationstack/api/context";
import { appRouter } from "@automationstack/api/routers/index";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRouterClient } from "@orpc/server";
import type { Context as HonoContext } from "hono";

import { registerCaseTools } from "./tools/cases";
import { registerModuleTools } from "./tools/modules";
import { registerProjectTools } from "./tools/projects";

const MCP_SERVER_INFO = { name: "testcase-platform", version: "0.1.0" };

/** 204 No Content: transport handled the request without a body to return. */
const HTTP_NO_CONTENT = 204;

/**
 * Fixed actor identity for writes arriving through the MCP channel;
 * it becomes savedBy / lastModifiedBy on created versions.
 */
const MCP_ACTOR = { clientId: "mcp", name: "MCP 迁移" };

/**
 * 合成用户，用来喂饱 protectedProcedure 的登录闸门——MCP 走的是进程内
 * createRouterClient，没有 HTTP 请求也就没有会话 cookie。它不对应 users
 * 表里的任何一行，只提供 id / role 两个字段供中间件判断。
 *
 * 角色取 `member`：MCP 只做项目、模块、用例的迁移，碰不到成员管理。
 * 将来若有人给 MCP 加管理员工具，会在这里直接 FORBIDDEN 而不是静默放行。
 *
 * ⚠️ `/mcp` 端点本身不在登录闸门之后（`apps/server/src/index.ts` 里它注册在
 * oRPC 中间件之外），任何能访问该端口的人都能经 MCP 读写全部业务数据。
 * 这条通道只应绑在本机 / 内网，不要直接暴露到公网。
 */
const MCP_USER = {
	createdAt: new Date(0),
	disabledAt: null,
	id: "00000000-0000-4000-8000-000000000001",
	passwordHash: "",
	role: "member",
	updatedAt: new Date(0),
	username: MCP_ACTOR.name,
} as const satisfies Context["user"];

function createMcpServer(): McpServer {
	const context: Context = {
		actor: MCP_ACTOR,
		cookies: [],
		secure: false,
		user: MCP_USER,
	};
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
 */
export async function handleMcpRequest(c: HonoContext): Promise<Response> {
	const server = createMcpServer();
	const transport = new StreamableHTTPTransport();
	await server.connect(transport);
	const response = await transport.handleRequest(c);
	return response ?? c.body(null, HTTP_NO_CONTENT);
}
