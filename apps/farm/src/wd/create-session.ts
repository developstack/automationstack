/**
 * `POST /wd/hub/session` 的全部编排：读 body → 认人 → 拉起会话 → 转发 → 换 id。
 *
 * 从 `wd/proxy.ts` 拆出来：那份文件到了 406 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为建会话是这条数据面上
 * **唯一一条要理解 body 的路径**：其余命令都只是「换个 sessionId 原样转发」。
 * 两者混在一个文件里读起来的负担全来自这一点——一半代码在解析 JSON、拼 W3C 错误、
 * 编排六个失败位置，另一半只是一根管子。
 */
import type { AcquiredSlot } from "@automationstack/browser-slots";
import type { Context } from "hono";

import { authenticateFarmRequest, type FarmIdentity } from "../auth";
import { finalizeSession } from "../finalize";
import {
	attachRecorder,
	type FarmDataPlaneDeps,
	launchSession,
} from "../launch";
import type { LiveSession } from "../session";
import {
	extractAsOptions,
	type NewSessionBody,
	resolveBrowserRequest,
	stripAsOptions,
} from "./capabilities";
import { injectSlotArgs } from "./slot-args";
import {
	ERROR_SESSION_NOT_CREATED,
	HTTP_INTERNAL,
	HTTP_OK,
	HTTP_SERVICE_UNAVAILABLE,
	sessionNotCreated,
	w3cError,
} from "./w3c-errors";

/** 客户端给的 create-session body，只认 `capabilities` 一个字段，其余原样透传。 */
type CreateSessionBody = NewSessionBody & Record<string, unknown>;

interface UpstreamSessionResult {
	body: unknown;
	status: number;
	upstreamSessionId: string | null;
}

function readUpstreamSessionId(body: unknown): string | null {
	if (typeof body !== "object" || body === null) {
		return null;
	}
	const { value } = body as { value?: unknown };
	if (typeof value !== "object" || value === null) {
		return null;
	}
	const { sessionId: id } = value as { sessionId?: unknown };
	return typeof id === "string" && id.length > 0 ? id : null;
}

/** 把上游响应体里的 `value.sessionId` 换成平台 id，其余（capabilities 等）原样保留。 */
function rewriteSessionId(body: unknown, platformId: string): unknown {
	if (typeof body !== "object" || body === null) {
		return body;
	}
	const { value } = body as { value?: unknown };
	if (typeof value !== "object" || value === null) {
		return body;
	}
	return {
		...(body as Record<string, unknown>),
		value: { ...(value as Record<string, unknown>), sessionId: platformId },
	};
}

async function postUpstreamSession(
	endpoint: string,
	body: unknown
): Promise<UpstreamSessionResult> {
	const response = await fetch(`${endpoint}/session`, {
		body: JSON.stringify(body),
		headers: { "content-type": "application/json; charset=utf-8" },
		method: "POST",
	});
	const parsed: unknown = await response.json().catch(() => null);
	return {
		body: parsed,
		status: response.status,
		upstreamSessionId: readUpstreamSessionId(parsed),
	};
}

interface CreateSessionContext {
	deps: FarmDataPlaneDeps;
	forwardBody: CreateSessionBody;
	/** 已拿到的槽位。recorder 要用它的 `cdpHttpEndpoint`。 */
	forwardSlot: AcquiredSlot;
	session: LiveSession;
	wdEndpoint: string;
}

/**
 * 转发 create-session，成功后**先挂 recorder 再返回响应**。
 *
 * 顺序理由见 `launch.ts` 的 `attachRecorder` 注释：WebDriver 模式下浏览器是被这次
 * 转发拉起来的，早一步挂只会 ECONNREFUSED；而只要响应还没交给客户端，客户端就
 * 发不出第一条导航命令，第一个页面不会漏录。
 */
async function completeCreateSession(
	ctx: CreateSessionContext
): Promise<Response> {
	const { deps, session } = ctx;
	let upstream: UpstreamSessionResult;
	try {
		upstream = await postUpstreamSession(ctx.wdEndpoint, ctx.forwardBody);
	} catch (error) {
		console.error(`转发 create-session 失败 session=${session.id}`, error);
		await finalizeSession({
			deps,
			reason: "upstream_unreachable",
			session,
			status: "failed",
		});
		return Response.json(
			w3cError(ERROR_SESSION_NOT_CREATED, "无法连接到浏览器容器"),
			{ status: HTTP_INTERNAL }
		);
	}
	if (upstream.upstreamSessionId === null) {
		await finalizeSession({
			deps,
			reason: "upstream_session_not_created",
			session,
			status: "failed",
		});
		// 上游的错误体原样回给客户端：chromedriver 说的话（比如「这个 caps 我不认」）
		// 比我们转述一遍有用得多。
		return Response.json(
			upstream.body ??
				w3cError(ERROR_SESSION_NOT_CREATED, "浏览器容器拒绝了这次会话"),
			{ status: upstream.status === HTTP_OK ? HTTP_INTERNAL : upstream.status }
		);
	}
	session.upstreamSessionId = upstream.upstreamSessionId;
	await attachRecorder(deps, session, ctx.forwardSlot);
	return Response.json(rewriteSessionId(upstream.body, session.id), {
		status: HTTP_OK,
	});
}

async function readJsonBody(c: Context): Promise<CreateSessionBody | null> {
	try {
		const body: unknown = await c.req.json();
		return typeof body === "object" && body !== null
			? (body as CreateSessionBody)
			: null;
	} catch {
		return null;
	}
}

/**
 * create-session 的前半段：读 body → 取 `as:options` → 认人。
 *
 * 单拎出来是因为这三步的失败长得一模一样（都是一条 `session not created`），
 * 而后半段的失败各有各的状态码。
 */
async function resolveCreateRequest(c: Context): Promise<
	| {
			body: CreateSessionBody;
			identity: FarmIdentity;
			kind: "ok";
			/** `as:options.node`：点名的槽位来源，没点名就是 null。 */
			nodeHint: string | null;
	  }
	| { kind: "error"; response: Response }
> {
	const body = await readJsonBody(c);
	if (body === null) {
		return {
			kind: "error",
			response: sessionNotCreated("请求体不是合法的 JSON 对象"),
		};
	}
	const extraction = extractAsOptions(body);
	if (extraction.kind !== "ok") {
		const message =
			extraction.kind === "missing"
				? "capabilities 里缺少 as:options（需要 token 与 projectId）"
				: extraction.message;
		return { kind: "error", response: sessionNotCreated(message) };
	}
	const auth = await authenticateFarmRequest(extraction.options);
	if (auth.kind !== "ok") {
		// 401/403 的区别在这条协议上表达不出来（W3C 只有 session not created），
		// 差异全在 message 里——客户端要的是「为什么开不了会话」这句话本身。
		return { kind: "error", response: sessionNotCreated(auth.message) };
	}
	return {
		body,
		identity: auth.identity,
		kind: "ok",
		nodeHint: extraction.options.node ?? null,
	};
}

/** `POST /wd/hub/session` 的全部编排。失败一律翻成 `session not created`。 */
export async function handleCreateSession(
	c: Context,
	deps: FarmDataPlaneDeps
): Promise<Response> {
	const prepared = await resolveCreateRequest(c);
	if (prepared.kind === "error") {
		return prepared.response;
	}
	const requested = resolveBrowserRequest(prepared.body);
	const stripped = stripAsOptions(prepared.body);
	const outcome = await launchSession({
		browserName: requested.browserName,
		browserVersion: requested.browserVersion,
		deps,
		identity: prepared.identity,
		nodeHint: prepared.nodeHint,
		protocol: "webdriver",
		requestedCapabilities: stripped.capabilities ?? null,
	});
	if (outcome.kind === "rejected") {
		// 503 + Retry-After 是这条链路上唯一能让客户端「知道该重试」的表达（D11）。
		return Response.json(w3cError(ERROR_SESSION_NOT_CREATED, outcome.message), {
			headers: { "retry-after": String(outcome.retryAfterSeconds) },
			status: HTTP_SERVICE_UNAVAILABLE,
		});
	}
	if (outcome.kind === "failed") {
		return sessionNotCreated(outcome.message);
	}
	return await completeCreateSession({
		deps,
		// 注入必须在 acquire 之后：`--remote-debugging-port` 的值是槽位分配的
		// （本地 provider 每条会话一个端口），槽位没拿到之前根本没有这个数字。
		forwardBody: injectSlotArgs(stripped, outcome.slot),
		forwardSlot: outcome.slot,
		session: outcome.session,
		wdEndpoint: outcome.slot.wdEndpoint ?? "",
	});
}
