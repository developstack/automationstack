import { createContext } from "@automationstack/api/context";
import { appRouter } from "@automationstack/api/routers/index";
import { env } from "@automationstack/env/server";
import { serve } from "@hono/node-server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { handleMcpRequest } from "./mcp/server";
import { responseCompression } from "./middleware/response-compression";
import {
	realtimeWebSocketHandler,
	realtimeWebSocketServer,
	startRealtime,
} from "./realtime/ws";

const app = new Hono();

app.use(logger());

/**
 * WS 升级必须在 cors 中间件之前注册：cors 会改写响应头，
 * 与 101 Switching Protocols 的升级响应冲突。
 */
app.get("/ws", realtimeWebSocketHandler);

app.use(
	"/*",
	cors({
		allowMethods: ["GET", "POST", "OPTIONS"],
		// 会话装在 HttpOnly cookie 里：跨端口的 fetch 必须获准携带凭据，
		// 否则浏览器既不发 Cookie 也不认响应里的 Set-Cookie。
		// 这也要求 origin 是具体地址而非 "*"（CORS_ORIGIN 已是一个 url）。
		credentials: true,
		origin: env.CORS_ORIGIN,
	})
);

/**
 * 压缩必须注册在 /ws 之后：/ws 的处理器先返回 101 升级响应，
 * 后续中间件不会被执行，压缩因此天然碰不到 WebSocket。
 */
app.use("/*", responseCompression());

export const apiHandler = new OpenAPIHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

/**
 * oRPC 的 handler 只负责产出数据，够不到响应头，所以 auth.login / auth.logout
 * 把要下发的 `Set-Cookie` 攒在 context.cookies 里，由这里逐条 append。
 * 必须用 append 而不是 set：一次响应可能要同时下发多枚 cookie。
 */
function withCookies(response: Response, cookies: string[]): Response {
	if (cookies.length === 0) {
		return response;
	}
	const headers = new Headers(response.headers);
	for (const cookie of cookies) {
		headers.append("set-cookie", cookie);
	}
	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}

app.use("/*", async (c, next) => {
	const context = await createContext({ context: c });

	const rpcResult = await rpcHandler.handle(c.req.raw, {
		context,
		prefix: "/rpc",
	});

	if (rpcResult.matched) {
		return withCookies(rpcResult.response, context.cookies);
	}

	const apiResult = await apiHandler.handle(c.req.raw, {
		context,
		prefix: "/api-reference",
	});

	if (apiResult.matched) {
		return withCookies(apiResult.response, context.cookies);
	}

	return next();
});

app.all("/mcp", (c) => handleMcpRequest(c));

app.get("/", (c) => c.text("OK"));

startRealtime();

serve(
	{
		fetch: app.fetch,
		port: env.PORT,
		websocket: { server: realtimeWebSocketServer },
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	}
);
