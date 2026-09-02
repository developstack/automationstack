import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

import {
	authenticateFarmRequest,
	type FarmIdentity,
	parseCdpQuery,
} from "../auth";
import { finalizeSession } from "../finalize";
import {
	attachRecorder,
	type FarmDataPlaneDeps,
	type LaunchOutcome,
	launchSession,
} from "../launch";
import { waitCdpDebuggerUrl } from "../launch-readiness";
import type { LiveSession } from "../session";
import { bridge, connectUpstream } from "./frame-bridge";
import {
	HTTP_BAD_GATEWAY,
	HTTP_BAD_REQUEST,
	HTTP_FORBIDDEN,
	HTTP_NOT_FOUND,
	HTTP_SERVICE_UNAVAILABLE,
	HTTP_UNAUTHORIZED,
	refuse,
} from "./http-refusal";

/**
 * CDP 数据面（plan §5.4）：一条**逐帧透传的 WebSocket 管道**。
 *
 * 客户端 `connectOverCDP("ws://farm:3002/cdp?token=...&projectId=...")`，farm 在
 * 中间既不解析 CDP 消息也不改写 id——它只是把两条 WS 上的帧原样搬来搬去。
 *
 * ## 为什么必须走原生 `server.on("upgrade")` 而不是 hono 的中间件
 *
 * 三个理由，任何一个单独成立都足够：
 *
 * 1. **CORS 之前**。升级握手要在 CORS 中间件之前处理，否则预检逻辑会碰到一个它
 *    根本不该管的请求（`apps/server/src/index.ts` 里有同样的注释与注册顺序）。
 * 2. **要在升级之前拒绝**。鉴权失败、配额满，都必须回一个**普通 HTTP 响应**
 *    （401/403/503）。一旦握手完成，能表达的就只剩 WS close code——`connectOverCDP`
 *    把它一律报成「连接被关闭」，用户看不到是没权限还是没槽位。
 * 3. **要逐帧转发而不是逐消息**。hono 的 ws 助手面向的是「读消息、写消息」的应用
 *    代码；这里要的是一根管子。
 *
 * ## 为什么这条路径没有空闲超时
 *
 * 一条开着的 WS 上多久没有帧不代表会话空闲：客户端可能正在本地跑断言、等一个外部
 * 系统。CDP 会话的存活判据就是**这条 WS 还开着**，加上寿命上限兜底（§5.2）。
 *
 * 拒绝用的 HTTP 报文搬去了 `http-refusal.ts`、握手之后那根管子搬去了
 * `frame-bridge.ts`（本文件曾到 343 行，越过仓库 300 行上限，
 * 见 scripts/check-file-rules.js）；这里留下的是升级这一刻的编排。
 */

/** 客户端的连接路径。写死是因为它同时也是文档里给用户的那一行连接串。 */
const CDP_PATH = "/cdp";

interface UpgradeContext {
	deps: FarmDataPlaneDeps;
	head: Buffer;
	request: IncomingMessage;
	socket: Duplex;
	wss: WebSocketServer;
}

interface PreparedSession {
	session: LiveSession;
	upstreamWsUrl: string;
}

/**
 * 解析连接串并认人。失败在**升级之前**回 400/401/403（文件头第 2 条）。
 */
async function authorize(ctx: UpgradeContext): Promise<{
	browserName: string | null;
	browserVersion: string | null;
	identity: FarmIdentity;
	nodeHint: string | null;
} | null> {
	const url = new URL(ctx.request.url ?? "/", "http://farm.local");
	const parsed = parseCdpQuery(url.searchParams);
	if (parsed.kind === "invalid") {
		refuse({
			message: parsed.message,
			socket: ctx.socket,
			status: HTTP_BAD_REQUEST,
		});
		return null;
	}
	const auth = await authenticateFarmRequest(parsed.params.options);
	if (auth.kind !== "ok") {
		refuse({
			message: auth.message,
			socket: ctx.socket,
			status: auth.kind === "unauthorized" ? HTTP_UNAUTHORIZED : HTTP_FORBIDDEN,
		});
		return null;
	}
	return {
		browserName: parsed.params.browserName,
		browserVersion: parsed.params.browserVersion,
		identity: auth.identity,
		nodeHint: parsed.params.options.node ?? null,
	};
}

/**
 * 把 launch 的两种失败翻成 socket 上的 HTTP 错误。
 *
 * 两种失败**不能合并成一个状态码**：配额/关停是 503 且带 `retry-after`（客户端
 * 该等一会儿再来，Selenium Grid 的客户端认这个头），起不来是 502（重试没有意义，
 * 要去看那条会话的死因）。
 */
function refuseLaunchOutcome(
	ctx: UpgradeContext,
	outcome: LaunchOutcome
): void {
	if (outcome.kind === "rejected") {
		refuse({
			extraHeaders: { "retry-after": String(outcome.retryAfterSeconds) },
			message: outcome.message,
			socket: ctx.socket,
			status: HTTP_SERVICE_UNAVAILABLE,
		});
		return;
	}
	if (outcome.kind === "failed") {
		refuse({
			message: outcome.message,
			socket: ctx.socket,
			status: HTTP_BAD_GATEWAY,
		});
	}
}

/**
 * 鉴权 → 配额 → 起容器 → 探活 → 挂 recorder。全部成功才返回，否则已经在 socket 上
 * 回过一个 HTTP 错误并断开。
 */
async function prepareSession(
	ctx: UpgradeContext
): Promise<PreparedSession | null> {
	const authorized = await authorize(ctx);
	if (authorized === null) {
		return null;
	}
	const outcome = await launchSession({
		browserName: authorized.browserName,
		browserVersion: authorized.browserVersion,
		deps: ctx.deps,
		identity: authorized.identity,
		nodeHint: authorized.nodeHint,
		protocol: "cdp",
		// CDP 这条路径上没有 capabilities 这个东西，列留空而不是编一个假的。
		requestedCapabilities: null,
	});
	if (outcome.kind !== "ok") {
		refuseLaunchOutcome(ctx, outcome);
		return null;
	}
	// 探活时已经问过一次 /json/version，这里再问一次是为了拿那个 WS 地址：
	// 它带着一个每次启动都不同的 GUID，只能问不能拼。容器此刻已经 ready，
	// 这一次调用是本地一个 round trip 就回来的。
	const upstreamWsUrl = await waitCdpDebuggerUrl(outcome.slot.cdpHttpEndpoint);
	if (upstreamWsUrl === null) {
		await finalizeSession({
			deps: ctx.deps,
			reason: "upstream_not_ready",
			session: outcome.session,
			status: "failed",
		});
		refuse({
			message: "浏览器容器没有给出 CDP 连接地址",
			socket: ctx.socket,
			status: HTTP_BAD_GATEWAY,
		});
		return null;
	}
	// 放行客户端之前挂 recorder：CDP 模式下浏览器早就在跑了，客户端一拿到管道
	// 就可能立刻 `Page.navigate`，晚一步就漏掉第一个页面（§5.5 关键时序）。
	await attachRecorder(ctx.deps, outcome.session, outcome.slot);
	return { session: outcome.session, upstreamWsUrl };
}

/**
 * 完成握手并接管。
 *
 * **先连上游、再完成客户端握手**：反过来的话，客户端握手一成功就会开始发
 * `Target.setAutoAttach` 之类的初始化消息，而那时上游还没连上，这些帧只能丢——
 * Playwright 会卡在初始化上直到超时。
 */
async function establish(
	ctx: UpgradeContext,
	prepared: PreparedSession
): Promise<void> {
	let upstream: WebSocket;
	try {
		upstream = await connectUpstream(prepared.upstreamWsUrl);
	} catch (error) {
		console.error(`连接上游 CDP 失败 session=${prepared.session.id}`, error);
		await finalizeSession({
			deps: ctx.deps,
			reason: "upstream_unreachable",
			session: prepared.session,
			status: "failed",
		});
		refuse({
			message: "无法连接到浏览器容器的 CDP 端点",
			socket: ctx.socket,
			status: HTTP_BAD_GATEWAY,
		});
		return;
	}
	ctx.wss.handleUpgrade(ctx.request, ctx.socket, ctx.head, (client) => {
		bridge({ client, deps: ctx.deps, session: prepared.session, upstream });
	});
}

/**
 * 建一个 `/cdp` 升级处理器，交给 `index.ts` 挂到 node http server 的
 * `upgrade` 事件上。
 *
 * 处理器**吞掉所有异常**：upgrade 事件里抛出去的错误没有任何东西会接，
 * 结果是一个永远挂着的 socket 加一条没人看见的 unhandledRejection。
 */
export function createCdpUpgradeHandler(
	deps: FarmDataPlaneDeps
): (request: IncomingMessage, socket: Duplex, head: Buffer) => void {
	const wss = new WebSocketServer({ noServer: true });
	return (request, socket, head) => {
		const [path] = (request.url ?? "/").split("?");
		if (path !== CDP_PATH) {
			refuse({
				message: `farm 只在 ${CDP_PATH} 上接受 WebSocket 升级`,
				socket,
				status: HTTP_NOT_FOUND,
			});
			return;
		}
		const ctx: UpgradeContext = { deps, head, request, socket, wss };
		// biome-ignore lint/complexity/noVoid: upgrade 事件处理器不能是 async，void 标记这里刻意不返回 Promise
		void (async () => {
			try {
				const prepared = await prepareSession(ctx);
				if (prepared !== null) {
					await establish(ctx, prepared);
				}
			} catch (error) {
				console.error("CDP 升级处理失败", error);
				socket.destroy();
			}
		})();
	};
}
