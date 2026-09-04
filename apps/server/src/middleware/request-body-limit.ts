import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { MAX_INGEST_BODY_BYTES } from "../ingest/body-limit";
import { HTTP_PAYLOAD_TOO_LARGE } from "../ingest/responses";

/**
 * 全站请求体上限。
 *
 * 为什么非得有一道**全局**的：oRPC 的 StandardHandler 会在任何 procedure
 * 中间件（`requireUser` 也在内）跑起来之前就把请求体整个读完并解析掉——
 * 「先鉴权再读体」在那条路径上根本不成立。没有上限时，一个不带任何 cookie 的
 * `POST /rpc/auth/login` 就足以把任意大的体灌进内存，鉴权还没轮到进程就先没了。
 * 同一个窟窿在 /mcp、/api-reference、Jira webhook 上都开着，而 compose 里
 * server 前面没有任何反向代理能替它兜这一层（只有 web/server/migrate/postgres）。
 *
 * 与 ingest 那两档上限的关系是**外层天花板，不是替代**：这里给 /ingest 的额度
 * 直接取 `MAX_INGEST_BODY_BYTES`（ingest 两档里更大的那档），于是凡是 ingest
 * 自己那道闸会拒的请求仍旧先由它拒——413 的文案还是那句指着「分批重发」
 * 「附件本体不走这个端点」说话的话，对账语义一个字不变。这里只兜住「连 ingest
 * 最大额度都超了」的那一段，那时候本来也没有更具体的话可说。ingest 日后调高
 * 额度，这里自动跟着走，不存在两处对齐的问题。
 */

const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;

/**
 * JSON-RPC 家族（/rpc、/api-reference、/mcp）的额度，取 2 MiB。
 *
 * 算法：这三条路上最大的一次合法请求是 `cases.importBatch`——契约硬闸是
 * 一次 `IMPORT_BATCH_LIMIT`（50）行，一行用例连步骤带标签写得再啰嗦也就几 KB，
 * 满打满算约 250 KB；`mindmap.batch` 的 100 个操作每个才两三百字节。
 * 2 MiB 留了约一个数量级的余量，同时把「单个请求能占多少内存」按死在个位
 * MiB——这正是这道闸要买的东西：它不是业务校验，业务上限在各 procedure 的
 * zod 里，那些才是能指着字段名说话的 400。
 */
const MAX_RPC_BODY_MIB = 2;
export const MAX_RPC_BODY_BYTES = MAX_RPC_BODY_MIB * BYTES_PER_MIB;

/**
 * Jira webhook 的额度，取 1 MiB。
 *
 * 它比 RPC 那档更小的理由是调用方不同：这条路上的体是 Jira 自己拼的 issue
 * 事件（含 ADF 描述），正常在几十 KB 量级；而它是**无会话**端点，任何人都能
 * 往上打，`handleJiraWebhook` 又必须先拿到原始文本才能算 HMAC——也就是说
 * 「验签之前先全读进内存」在这条路上同样绕不开，额度就得压在验签成本之下。
 */
export const MAX_JIRA_WEBHOOK_BODY_BYTES = BYTES_PER_MIB;

/**
 * 没有登记在下表里的路径的兜底额度，取 64 KiB。
 *
 * 刻意取小：当前会带体的端点全在下表里（`/`、`/health`、`/ws` 一个字节的体
 * 都没有），落到这里的只剩「打错路径的 POST」。**这是一道闭世界的闸**——
 * 新增一条会收大体的路由却忘了在下表登记，症状是它稳定地回 413，
 * 而不是悄悄地不设防。这个方向的失败是想要的那个方向。
 */
const DEFAULT_MAX_BODY_KIB = 64;
export const DEFAULT_MAX_BODY_BYTES = DEFAULT_MAX_BODY_KIB * BYTES_PER_KIB;

/**
 * 路径前缀 → 额度。按顺序取第一个命中的前缀，因此写法上不允许一个前缀是
 * 另一个的前缀（`/api/jira/webhook/` 与 `/api-reference` 不重叠）。
 *
 * 用前缀而不是精确路径：`/rpc` 与 `/api-reference` 底下是整棵 procedure 树，
 * `/api/jira/webhook/:projectId` 带路径参数，逐条列举必然漏。
 */
const BODY_LIMIT_BY_PREFIX: readonly (readonly [string, number])[] = [
	["/ingest/", MAX_INGEST_BODY_BYTES],
	["/rpc/", MAX_RPC_BODY_BYTES],
	["/api-reference", MAX_RPC_BODY_BYTES],
	["/api/jira/webhook/", MAX_JIRA_WEBHOOK_BODY_BYTES],
	["/mcp", MAX_RPC_BODY_BYTES],
];

function maxBodyBytesFor(path: string): number {
	for (const [prefix, maxSize] of BODY_LIMIT_BY_PREFIX) {
		if (path.startsWith(prefix)) {
			return maxSize;
		}
	}
	return DEFAULT_MAX_BODY_BYTES;
}

/**
 * 413 的响应体形状与 ingest 那三条端点保持一致（`{ error, message }`）：
 * 同一种失败在全站只该有一种形状，客户端才可能统一处理。
 *
 * 文案不点名具体端点、也不说「你是谁」：这道闸在鉴权之前，任何人都能触发它。
 */
function payloadTooLarge(c: Context, maxSize: number): Response {
	return c.json(
		{
			error: "payload-too-large",
			message: `请求体超过 ${maxSize} 字节；如果这是一次正常的批量操作，请分批重发`,
		},
		HTTP_PAYLOAD_TOO_LARGE
	);
}

/**
 * 每个额度对应一个 `bodyLimit` 实例（它的 maxSize 在构造时就定死了），
 * 按额度缓存，避免每个请求都新建一个中间件闭包。
 */
const limiters = new Map<number, MiddlewareHandler>();

function limiterFor(maxSize: number): MiddlewareHandler {
	const cached = limiters.get(maxSize);
	if (cached !== undefined) {
		return cached;
	}
	const created = bodyLimit({
		maxSize,
		onError: (c) => payloadTooLarge(c, maxSize),
	});
	limiters.set(maxSize, created);
	return created;
}

/**
 * 按路由族选额度的请求体上限中间件。
 *
 * 超限一律是一条明确的 413：`bodyLimit` 在有 `content-length` 时只看头、
 * 一个字节都不读；没有 `content-length`（分块传输）时边读边计数，一超过就
 * 立刻停止读取并返回——两条路都不会把请求悬在那里。
 */
export function requestBodyLimit(): MiddlewareHandler {
	return (c, next) => limiterFor(maxBodyBytesFor(c.req.path))(c, next);
}
