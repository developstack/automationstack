import type { Context } from "hono";

export const HTTP_BAD_REQUEST = 400;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;
export const HTTP_PAYLOAD_TOO_LARGE = 413;

const UNAUTHORIZED_HEADERS = { "WWW-Authenticate": "Bearer" } as const;

export function unauthorized(c: Context): Response {
	return c.json(
		{
			error: "unauthorized",
			message: "缺少或无效的 Authorization: Bearer <token>",
		},
		HTTP_UNAUTHORIZED,
		UNAUTHORIZED_HEADERS
	);
}

export function forbidden(c: Context): Response {
	return c.json(
		{
			error: "forbidden",
			message: "这枚 token 的主人不是该项目的成员",
		},
		HTTP_FORBIDDEN
	);
}

export function projectNotFound(c: Context): Response {
	return c.json(
		{ error: "project-not-found", message: "projectId 指向的项目不存在" },
		HTTP_NOT_FOUND
	);
}

export function invalidPayload(c: Context, message: string): Response {
	return c.json({ error: "invalid-payload", message }, HTTP_BAD_REQUEST);
}

type ParsedJsonBody = { body: unknown; kind: "ok" } | { kind: "invalid-json" };

export function parseJsonBody(rawBody: string): ParsedJsonBody {
	try {
		return { body: JSON.parse(rawBody), kind: "ok" };
	} catch {
		return { kind: "invalid-json" };
	}
}

export const INVALID_JSON_MESSAGE =
	"请求体不是合法 JSON（Content-Type 应为 application/json）";

export function unhandledOutcome(outcome: never): never {
	throw new Error(`未映射的 ingest 结果：${JSON.stringify(outcome)}`);
}
