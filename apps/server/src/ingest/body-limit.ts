import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { HTTP_PAYLOAD_TOO_LARGE } from "./responses";

export const MAX_INGEST_BODY_BYTES = 16 * 1024 * 1024;

export const MAX_INGEST_ATTACHMENT_BODY_BYTES = 4 * 1024 * 1024;

interface IngestBodyLimitOptions {
	advice: string;
	maxSize: number;
}

export function ingestBodyLimit(
	options: IngestBodyLimitOptions
): MiddlewareHandler {
	return bodyLimit({
		maxSize: options.maxSize,
		onError: (c) =>
			c.json(
				{
					error: "payload-too-large",
					message: `请求体超过 ${options.maxSize} 字节；${options.advice}`,
				},
				HTTP_PAYLOAD_TOO_LARGE
			),
	});
}
