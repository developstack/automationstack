import type { MiddlewareHandler } from "hono";
import { compress } from "hono/compress";

const COMPRESSION_THRESHOLD_BYTES = 1024;

const COMPRESSIBLE_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;

const NEVER_COMPRESSED_PATHS = new Set(["/mcp", "/ws"]);

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
