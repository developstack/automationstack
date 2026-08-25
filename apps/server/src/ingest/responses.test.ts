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

/**
 * 四条 ingest 端点共用的应答零件。
 *
 * 这里测的全是**对外说过的话**：状态码、错误体的 `error` 取值、401 上的
 * `WWW-Authenticate`。SDK 就是照着这些字符串写的分支，改动它们等于改协议，
 * 所以每一条都值一个断言——搬运层没有别的行为可测，就这些。
 */

/** 顶层常量：正则字面量不许在函数里现造（`useTopLevelRegex`）。 */
const UNMAPPED_OUTCOME_PATTERN = /brand-new-outcome/;

/** 这几个零件签名上要一个 `Context`，最省事的造法就是真跑一次 Hono 请求。 */
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
	// 不带 realm / error=：`resolveUserFromBearer` 对外只有「过了」与「没过」，
	// 多写的参数是在编造一个服务端并不知道的区别。
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
	// 这一层只判「是不是 JSON」。判「是不是一个请求体」是 handler 里 zod 的事，
	// 在这里抢答会让同一种发错有两个来源、早晚说出两句不一样的话。
	expect(parseJsonBody("null")).toEqual({ body: null, kind: "ok" });
	expect(parseJsonBody("123")).toEqual({ body: 123, kind: "ok" });
});

test("parseJsonBody：不是 JSON 就折算成 invalid-json，绝不抛出去", () => {
	// 抛出去会被 Hono 翻成 500——上报方明明是自己发错了一段 body，
	// 看到「服务器错误」只会跑去问平台哪儿挂了。
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
	// 兜底返回 401/400 才是搬运层最危险的失误：把一种新语义悄悄映射成旧状态码，
	// 上报方会拿到一句自信但错误的解释。运行时不可达，这里用 as never 造出来。
	expect(() =>
		unhandledOutcome({ kind: "brand-new-outcome" } as never)
	).toThrow(UNMAPPED_OUTCOME_PATTERN);
});
