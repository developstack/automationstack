import type { Context, Hono } from "hono";

import { finalizeSession } from "../finalize";
import { stopRecorderQuietly } from "../finalize-support";
import type { FarmDataPlaneDeps } from "../launch";
import type { LiveSession } from "../session";
import { handleCreateSession } from "./create-session";
import { HTTP_OK, notFoundSession } from "./w3c-errors";

/**
 * WebDriver 数据面（plan §5.3）：一个**协议兼容的反向代理**。
 *
 * 客户端把 `http://farm:3002/wd/hub` 当成一个标准的 WebDriver 端点，farm 在中间
 * 只做四件事：认人、选容器、把 sessionId 换成平台 id、在收尾时把产物收走。
 * 除此之外的每一条命令都**原样转发**——不解析、不改写、不缓存。
 *
 * ## 为什么是「逐命令透明转发」而不是「解析后重放」
 *
 * WebDriver 的命令集还在长（新的 actions、shadow root、federated credential…），
 * 任何「认识每一条命令」的代理都会在客户端升级的那天变成瓶颈：不认识的命令要么
 * 被拒，要么走一条没测过的默认路径。透明转发的代价是拿不到「客户端到底点了什么」
 * 这类语义信息——而那正是 recorder 从 CDP 侧拿的东西（D5），不必在这里重复。
 *
 * ## sessionId 的双份身份
 *
 * 客户端看到的是平台 id（uuid，与 `farm_sessions.id` 同一个），上游 chromedriver
 * 用的是它自己发的 id。**不能直接把上游 id 透给客户端**：会话详情页、kill、产物
 * 全部按平台 id 索引，而上游 id 在容器销毁后就没有任何意义了。这层映射存在内存
 * 注册表里（`LiveSession.upstreamSessionId`）。
 *
 * 建会话那条路径搬去了 `create-session.ts`、W3C 的错误体与状态码搬去了
 * `w3c-errors.ts`（本文件曾到 406 行，越过仓库 300 行上限，
 * 见 scripts/check-file-rules.js）；这里留下的是「转发」与「路由挂载顺序」。
 */

/**
 * 逐跳首部：它们描述的是**这一段 TCP 连接**，转发时带过去就是撒谎。
 * `content-length` 也要去掉——body 经过 undici 之后长度可能变（解压、重新编码）。
 */
const HOP_BY_HOP_HEADERS = new Set([
	"connection",
	"content-encoding",
	"content-length",
	"host",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);

function filterHeaders(source: Headers): Headers {
	const headers = new Headers();
	for (const [key, value] of source.entries()) {
		if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
			headers.set(key, value);
		}
	}
	return headers;
}

/** 命令转发：路径换成上游 sessionId，其余（方法、首部、二进制 body）原样过。 */
async function forwardCommand(
	c: Context,
	session: LiveSession,
	suffix: string
): Promise<Response> {
	const { slot } = session;
	if (slot === null || session.upstreamSessionId === null) {
		return notFoundSession(session.id);
	}
	const url = new URL(
		`${slot.wdEndpoint}/session/${session.upstreamSessionId}${suffix}`
	);
	url.search = new URL(c.req.url).search;
	const { method } = c.req;
	const hasBody = method !== "GET" && method !== "HEAD";
	const response = await fetch(url, {
		body: hasBody ? await c.req.arrayBuffer() : undefined,
		headers: filterHeaders(c.req.raw.headers),
		method,
	});
	// 只有真的转发成功才算「客户端还活着」，超时计时器据此重置（§5.2）。
	session.touch();
	return new Response(response.body, {
		headers: filterHeaders(response.headers),
		status: response.status,
	});
}

/**
 * `DELETE /wd/hub/session/:sid`：**截收尾图 → 停 recorder → 转发上游 DELETE → finalize**。
 *
 * 前两步都必须在转发之前，理由不同：
 * - 截图：DELETE 一到 chromedriver 浏览器就开始退出，那之后
 *   `Page.captureScreenshot` 拿回来的要么是超时要么是一张空白页（§5.5）。
 * - 停 recorder：同一次退出会把 recorder 的 CDP 连接一起带走，而 recorder 分不出
 *   「浏览器正常退出」和「观测挂了」，会重连一次再报 `recorder_detached`——于是每条
 *   正常会话的 status_reason 里都躺着一个假故障（见 stopRecorderQuietly 的注释）。
 *   截图既然已经拍完，这里停掉不会少任何东西。
 *
 * 停不掉也照转不误：`stopRecorderQuietly` 自己吞异常，转发与收尾不受影响，也不会
 * 因为「停失败」写下任何死因。
 */
async function handleDeleteSession(
	session: LiveSession,
	deps: FarmDataPlaneDeps,
	c: Context
): Promise<Response> {
	if (session.recorder !== null && !session.screenshotCaptured) {
		session.screenshotCaptured = true;
		try {
			await session.recorder.captureScreenshot("final");
		} catch (error) {
			console.warn(`DELETE 前收尾截图失败 session=${session.id}`, error);
		}
	}
	await stopRecorderQuietly(session);
	let upstreamBody: unknown = { value: null };
	try {
		const response = await forwardCommand(c, session, "");
		upstreamBody = await response.json().catch(() => ({ value: null }));
	} catch (error) {
		console.warn(`转发 DELETE 失败 session=${session.id}`, error);
	}
	await finalizeSession({ deps, session, status: "completed" });
	return Response.json(upstreamBody, { status: HTTP_OK });
}

/**
 * 挂载 WebDriver 数据面。
 *
 * 路由注册顺序有讲究：`DELETE /wd/hub/session/:sid` 必须在通配转发之前，
 * 否则 hono 会先命中 `:sid/*`——那条路径不会走收尾，会话会被漏掉直到超时。
 */
export function registerWebDriverRoutes(
	app: Hono,
	deps: FarmDataPlaneDeps
): void {
	// 标准探活端点。客户端（尤其是 Grid 兼容层）会先问这一下再建会话。
	app.get("/wd/hub/status", (c) => {
		const decision = deps.registry.admit();
		return c.json({
			value: {
				message:
					decision.kind === "accepted"
						? "farm 可以接受新会话"
						: decision.message,
				ready: decision.kind === "accepted",
				// W3C 只规定了 `ready` 与 `message`，多出来的字段客户端一律忽略。
				// 放在这里是因为「为什么不 ready」的答案就是各源的占用
				// （plan §12），而运维手上通常只有这一个能 curl 的端点。
				sources: deps.sources.usage(),
			},
		});
	});

	app.post("/wd/hub/session", (c) => handleCreateSession(c, deps));

	app.delete("/wd/hub/session/:sid", (c) => {
		const sid = c.req.param("sid");
		const session = deps.registry.get(sid);
		if (session === undefined) {
			return notFoundSession(sid);
		}
		return handleDeleteSession(session, deps, c);
	});

	app.all("/wd/hub/session/:sid/*", (c) => {
		const sid = c.req.param("sid");
		const session = deps.registry.get(sid);
		if (session === undefined) {
			return notFoundSession(sid);
		}
		const prefix = `/wd/hub/session/${sid}`;
		return forwardCommand(c, session, c.req.path.slice(prefix.length));
	});
}
