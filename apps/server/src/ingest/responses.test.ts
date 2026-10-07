import type { Context } from "hono";
import { Hono } from "hono";
import { expect, test } from "vitest";

import {
	HTTP_BAD_REQUEST,
	HTTP_NOT_FOUND,
	HTTP_PAYLOAD_TOO_LARGE,
	HTTP_UNAUTHORIZED,
	INVALID_JSON_MESSAGE,
	invalidPayload,
	parseJsonBody,
	projectNotFound,
	unauthorized,
	unhandledOutcome,
} from "./responses";

const UNMAPPED_OUTCOME_PATTERN = /brand-new-outcome/;

async function respond(build: (c: Context) => Response): Promise<Response> {
	const app = new Hono();
	app.get("/probe", (c) => build(c));
	return await app.request("/probe");
}

test("状态码常量就是 HTTP 那几个数，不是自定义编号", () => {
	expect(HTTP_BAD_REQUEST).toBe(400);
	expect(HTTP_UNAUTHORIZED).toBe(401);
	expect(HTTP_NOT_FOUND).toBe(404);
	expect(HTTP_PAYLOAD_TOO_LARGE).toBe(413);
});

test("401 带 WWW-Authenticate: Bearer，且只写 Bearer", async () => {
	const response = await respond(unauthorized);
	expect(response.status).toBe(HTTP_UNAUTHORIZED);
	expect(response.headers.get("www-authenticate")).toBe("Bearer");
	expect(await response.json()).toEqual({
		error: "unauthorized",
		message: "缺少或无效的 Authorization: Bearer <token>",
	});
});

test("404 是 project-not-found，不与 401 共用一个错误码", async () => {
	const response = await respond(projectNotFound);
	expect(response.status).toBe(HTTP_NOT_FOUND);
	expect(await response.json()).toEqual({
		error: "project-not-found",
		message: "projectId 指向的项目不存在",
	});
});

test("400 的 message 原样回给上报方：那是字段名级别的说明", async () => {
	const message = 'results.0.sourceRef: 必填；"引号" 与中文都不许被改写';
	const response = await respond((c) => invalidPayload(c, message));
	expect(response.status).toBe(HTTP_BAD_REQUEST);
	expect(await response.json()).toEqual({ error: "invalid-payload", message });
});

test("parseJsonBody：合法 JSON 走 ok 分支，body 是 parse 后的值", () => {
	expect(parseJsonBody('{"projectId":"x"}')).toEqual({
		body: { projectId: "x" },
		kind: "ok",
	});
});

test("parseJsonBody：`null` 与 `123` 是合法 JSON，放行交给 zod 去拒", () => {
	expect(parseJsonBody("null")).toEqual({ body: null, kind: "ok" });
	expect(parseJsonBody("123")).toEqual({ body: 123, kind: "ok" });
});

test("parseJsonBody：不是 JSON 就折算成 invalid-json，绝不抛出去", () => {
	expect(parseJsonBody("")).toEqual({ kind: "invalid-json" });
	expect(parseJsonBody("{")).toEqual({ kind: "invalid-json" });
	expect(parseJsonBody("not json at all")).toEqual({ kind: "invalid-json" });
});

test("INVALID_JSON_MESSAGE 一个字段名都不透露（它排在鉴权之前）", () => {
	expect(INVALID_JSON_MESSAGE).toBe(
		"请求体不是合法 JSON（Content-Type 应为 application/json）"
	);
	expect(INVALID_JSON_MESSAGE).not.toContain("projectId");
	expect(INVALID_JSON_MESSAGE).not.toContain("sourceRef");
});

test("unhandledOutcome 抛异常，不兜底成某个旧状态码", () => {
	expect(() =>
		unhandledOutcome({ kind: "brand-new-outcome" } as never)
	).toThrow(UNMAPPED_OUTCOME_PATTERN);
});
