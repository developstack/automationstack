import { casdoorHealth } from "@automationstack/api/auth/casdoor/health";
import { getEffectiveAuthSettings } from "@automationstack/api/auth/settings-store";
import { createContext } from "@automationstack/api/context";
import { runWithClientIp } from "@automationstack/api/lib/request-client-ip";
import { appRouter } from "@automationstack/api/routers/index";
import { env } from "@automationstack/env/server";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { BootstrapAdminError, bootstrapAdmin } from "./auth/bootstrap-admin";
import { registerCasdoorRoutes } from "./auth/casdoor-routes";
import { registerIngestRoutes } from "./ingest/routes";
import { getJobsStatus, startJobs, stopJobs } from "./jobs/boss";
import { handleMcpRequest } from "./mcp/server";
import { isAllowedOrigin } from "./middleware/allowed-origin";
import { requestBodyLimit } from "./middleware/request-body-limit";
import { responseCompression } from "./middleware/response-compression";
import {
	realtimeWebSocketHandler,
	realtimeWebSocketServer,
	startRealtime,
} from "./realtime/ws";

const app = new Hono();

app.use(logger());

app.get("/ws", realtimeWebSocketHandler);

app.use(
	"/*",
	cors({
		allowMethods: ["GET", "POST", "OPTIONS"],
		credentials: true,
		origin: (origin) =>
			isAllowedOrigin(origin, {
				corsOrigin: env.CORS_ORIGIN,
				nodeEnv: env.NODE_ENV,
			})
				? origin
				: null,
	})
);

app.use("/*", responseCompression());

app.use("/*", requestBodyLimit());

registerCasdoorRoutes(app);

registerIngestRoutes(app);

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

function readClientIp(c: Context): string | null {
	try {
		return getConnInfo(c).remote.address ?? null;
	} catch {
		return null;
	}
}

app.use("/*", async (c, next) => {
	const context = await createContext({ context: c });
	const clientIp = readClientIp(c);

	const rpcResult = await runWithClientIp(clientIp, () =>
		rpcHandler.handle(c.req.raw, {
			context,
			prefix: "/rpc",
		})
	);

	if (rpcResult.matched) {
		return withCookies(rpcResult.response, context.cookies);
	}

	const apiResult = await runWithClientIp(clientIp, () =>
		apiHandler.handle(c.req.raw, {
			context,
			prefix: "/api-reference",
		})
	);

	if (apiResult.matched) {
		return withCookies(apiResult.response, context.cookies);
	}

	return next();
});

app.all("/mcp", (c) => handleMcpRequest(c));

app.get("/", (c) => c.text("OK"));

// casdoor 模式下报告 Casdoor 能否访问。只报告，不让 /health 失败（plan 021 T13）。
app.get("/health", async (c) => {
	let casdoor: Awaited<ReturnType<typeof casdoorHealth>> = null;
	try {
		casdoor = await casdoorHealth(await getEffectiveAuthSettings());
	} catch (error) {
		console.error("读取认证设置失败，/health 不报告 Casdoor 状态：", error);
	}
	return c.json({
		jobs: getJobsStatus(),
		status: "ok",
		...(casdoor === null ? {} : { casdoor }),
	});
});

const EXIT_FAILURE = 1;

try {
	await bootstrapAdmin({ info: console.log, warn: console.warn });
} catch (error) {
	if (error instanceof BootstrapAdminError) {
		console.error(`服务拒绝启动：${error.message}`);
	} else {
		console.error("服务拒绝启动：创建引导管理员失败。", error);
	}
	process.exit(EXIT_FAILURE);
}

startRealtime();

// biome-ignore lint/complexity/noVoid: 刻意的 fire-and-forget——void 标记不等待，失败已在 startJobs 内部吞掉
void startJobs();

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

let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		if (shuttingDown) {
			process.exit(1);
		}
		shuttingDown = true;
		console.log(`收到 ${signal}，正在退出…`);
		// biome-ignore lint/complexity/noVoid: 信号处理器不能是 async，void 标记这里刻意不返回 Promise
		void stopJobs().finally(() => {
			process.exit(0);
		});
	});
}
