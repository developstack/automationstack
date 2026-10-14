import { Hono } from "hono";
import { expect, test } from "vitest";

import {
	ingestBodyLimit,
	MAX_INGEST_ATTACHMENT_BODY_BYTES,
	MAX_INGEST_BODY_BYTES,
} from "./body-limit";
import { HTTP_PAYLOAD_TOO_LARGE } from "./responses";

const SMALL_LIMIT = 100;

function request(advice: string, init: RequestInit): Promise<Response> {
	const app = new Hono();
	app.post("/probe", ingestBodyLimit({ advice, maxSize: SMALL_LIMIT }), (c) =>
		c.json({ reached: true })
	);
	return Promise.resolve(app.request("/probe", { method: "POST", ...init }));
}

test("没超限就放行，中间件不碰请求体", async () => {
	const response = await request("请分批重发", { body: "tiny" });
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ reached: true });
});

// 413 的后半句各端点各说各的，不是一句通用文案
test.each([
	[
		"超限是 413，且处理函数一次都没跑到",
		"请分批重发",
		"x".repeat(SMALL_LIMIT + 1),
		{},
	],
	[
		"声称的 content-length 就够大时，body 都不用读完就 413",
		"附件本体不走这个端点（它只收元数据）",
		"tiny",
		{ "content-length": String(SMALL_LIMIT + 1) },
	],
])("%s", async (_name, advice, body, headers) => {
	const response = await request(advice, { body, headers });
	expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
	expect(await response.json()).toEqual({
		error: "payload-too-large",
		message: `请求体超过 ${SMALL_LIMIT} 字节；${advice}`,
	});
});

test("附件那档比结论那档小一个数量级，是刻意的", () => {
	expect(MAX_INGEST_BODY_BYTES).toBe(16 * 1024 * 1024);
	expect(MAX_INGEST_ATTACHMENT_BODY_BYTES).toBe(4 * 1024 * 1024);
	expect(MAX_INGEST_ATTACHMENT_BODY_BYTES).toBeLessThan(MAX_INGEST_BODY_BYTES);
});

test("附件那档盖得住契约上限的一次请求：契约受理的绝不先撞 413", () => {
	const worstCaseContractBytes = 2000 * 1700;
	expect(MAX_INGEST_ATTACHMENT_BODY_BYTES).toBeGreaterThan(
		worstCaseContractBytes
	);
});
