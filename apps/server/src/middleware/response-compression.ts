import type { MiddlewareHandler } from "hono";
import { compress } from "hono/compress";

/**
 * 低于该字节数时 gzip 收益抵不过 CPU 与 gzip 头开销，直接放行。
 * Hono 的默认阈值同为 1024，这里显式写出以便调参。
 */
const COMPRESSION_THRESHOLD_BYTES = 1024;

/**
 * 只压缩确定「一次性返回、非流式」的 JSON 响应。
 *
 * /rpc 是混合端点：绝大多数 procedure 返回 `application/json`（可压），
 * 而 event-iterator 返回 `text/event-stream`（SSE，绝不能压——压缩流会
 * 缓冲/分块，导致事件无法即时到达客户端）。
 * 因此判断依据是响应的 content-type，而不是请求路径。
 */
const COMPRESSIBLE_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;

/**
 * 无论响应 content-type 如何都必须整体绕开压缩的端点：
 * - /ws：WebSocket 升级，任何改写响应头的中间件都会破坏 101 握手；
 * - /mcp：StreamableHTTPTransport，同一路径既可能返回 JSON 也可能
 *   降级成 SSE 长连接，保守整体排除。
 */
const NEVER_COMPRESSED_PATHS = new Set(["/mcp", "/ws"]);

/**
 * 响应压缩中间件。两层防护：先按路径排除流式/升级端点，
 * 再按响应 content-type 排除 SSE 等流式载荷。
 */
export function responseCompression(): MiddlewareHandler {
	const compressJson = compress({
		contentTypeFilter: COMPRESSIBLE_CONTENT_TYPE,
		threshold: COMPRESSION_THRESHOLD_BYTES,
	});

	return (c, next) => {
		if (NEVER_COMPRESSED_PATHS.has(c.req.path)) {
			return next();
		}
		return compressJson(c, next);
	};
}
