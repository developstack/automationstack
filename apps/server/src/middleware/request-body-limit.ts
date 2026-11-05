import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { MAX_INGEST_BODY_BYTES } from "../ingest/body-limit";
import { HTTP_PAYLOAD_TOO_LARGE } from "../ingest/responses";

const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;

const MAX_RPC_BODY_MIB = 2;
export const MAX_RPC_BODY_BYTES = MAX_RPC_BODY_MIB * BYTES_PER_MIB;

const DEFAULT_MAX_BODY_KIB = 64;
export const DEFAULT_MAX_BODY_BYTES = DEFAULT_MAX_BODY_KIB * BYTES_PER_KIB;

const BODY_LIMIT_BY_PREFIX: readonly (readonly [string, number])[] = [
	["/ingest/", MAX_INGEST_BODY_BYTES],
	["/rpc/", MAX_RPC_BODY_BYTES],
	["/api-reference", MAX_RPC_BODY_BYTES],
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

function payloadTooLarge(c: Context, maxSize: number): Response {
	return c.json(
		{
			error: "payload-too-large",
			message: `请求体超过 ${maxSize} 字节；如果这是一次正常的批量操作，请分批重发`,
		},
		HTTP_PAYLOAD_TOO_LARGE
	);
}

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

export function requestBodyLimit(): MiddlewareHandler {
	return (c, next) => limiterFor(maxBodyBytesFor(c.req.path))(c, next);
}
