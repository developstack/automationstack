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

import { registerIngestRoutes } from "./ingest/routes";
import { registerJiraWebhook } from "./jira/webhook";
import { getJobsStatus, startJobs, stopJobs } from "./jobs/boss";
import { handleMcpRequest } from "./mcp/server";
import { requestBodyLimit } from "./middleware/request-body-limit";
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

/**
 * 请求体上限必须挂在**这个位置**：在下面所有会读请求体的东西之前
 * （Jira webhook 的原始体、ingest 的三条 POST、以及 oRPC 的输入管道），
 * 又在 cors 之后——否则 413 不带 CORS 头，浏览器只能看到一个不可读的失败。
 *
 * 它在 oRPC 之前生效这一点是关键：oRPC 的 StandardHandler 会在
 * `requireUser` 跑起来之前就把体读完，所以「未认证请求」的体大小是这里、
 * 也只能是这里说了算。额度按路由族分档，取值理由见 request-body-limit.ts。
 */
app.use("/*", requestBodyLimit());

/**
 * Jira webhook 注册在 oRPC 中间件**之前**：它是外部系统发来的、没有会话
 * cookie 的请求，走一遍 createContext 只会白做一次 cookie 解析加一次读库，
 * 而且它需要原始请求体，本来就不该进 oRPC 的输入管道。
 */
registerJiraWebhook(app);

/** 自动化上报（ingest）同理：外部 CI 里的 SDK 发来的请求，同样没有会话 cookie。 */
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

/**
 * 取**socket 层**的对端地址，刻意**不读 `X-Forwarded-For` 之类的头**。
 *
 * 这个地址是 `auth.login` 限流的分桶依据（见
 * `packages/api/src/lib/login-rate-limit.ts`），而转发头是客户端能随手伪造的
 * 一行文本：只要读它，攻击者每个请求换一个 XFF 就能把限流整个绕过去，
 * 那道闸就成了摆设。转发头只有在**可信反代之后**、且明确知道要剥掉几跳时
 * 才有意义；当前 compose 里 server 前面根本没有反代，socket 地址就是真地址。
 * 日后真在前面放了反代，要改的是这一个函数，并且必须同时定下「信任几跳」。
 *
 * 取不到时返回 null 而不是编一个占位地址：见 `request-client-ip.ts`。
 */
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

	// 只把 oRPC 的分发包在这个作用域里：handler 够不到 Request，
	// 来源地址只能这样传进去（`runWithClientIp` 的注释解释了为什么不是 context）。
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

/**
 * 健康检查。**永远返回 200**，后台任务的死活只体现在 body 的 `jobs` 字段上。
 *
 * 为什么不把它并进 `/`、也不让 jobs 失败翻成非 2xx：`/` 是 docker-compose 里
 * server 的 healthcheck 探针（只看 `r.ok`），而那个服务是 `restart: unless-stopped`
 * 且 web 用 `depends_on: service_healthy` 挂着它。让「每日扫描没起来」这种可降级的
 * 故障去翻 healthcheck，换来的是整个服务被反复重启、web 一并起不来——用重启治
 * 一个重启治不好的问题。要看后台任务，读这里的 `jobs`。
 *
 * 只报状态枚举、不带错误详情：这是个无鉴权端点，而启动失败的原始 error 里可能
 * 带着 DATABASE_URL。详情去日志里看。
 */
app.get("/health", (c) => c.json({ jobs: getJobsStatus(), status: "ok" }));

startRealtime();

// 后台任务（pg-boss）：启动失败在内部已吞掉，不 await、也不拖慢 HTTP 服务起来。
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

// 最小优雅退出：此前没有 shutdown 处理，这里只做「停掉后台任务再退出」，
// 不引入框架。
//
// stopJobs() 必须等它跑完再 exit：pg-boss 的 stop() 全程是 await 链，
// 紧跟其后的同步 process.exit() 会在它第一个 await 恢复之前就把进程干掉，
// 那样这行调用就纯属装饰。超时上限在 stopJobs 内部，不会卡住退出。
let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		if (shuttingDown) {
			// 第二次信号 = 「别等了」，立刻走人。
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
