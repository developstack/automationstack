import { Hono } from "hono";
import { expect, test } from "vitest";

import {
	ingestBodyLimit,
	MAX_INGEST_ATTACHMENT_BODY_BYTES,
	MAX_INGEST_BODY_BYTES,
} from "./body-limit";
import { HTTP_PAYLOAD_TOO_LARGE } from "./responses";

const SMALL_LIMIT = 100;

function buildApp(maxSize: number, advice: string): Hono {
	const app = new Hono();
	app.post("/probe", ingestBodyLimit({ advice, maxSize }), (c) =>
		c.json({ reached: true })
	);
	return app;
}

test("没超限就放行，中间件不碰请求体", async () => {
	const app = buildApp(SMALL_LIMIT, "请分批重发");
	const response = await app.request("/probe", {
		body: "tiny",
		method: "POST",
	});
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ reached: true });
});

test("超限是 413，且处理函数一次都没跑到", async () => {
	const app = buildApp(SMALL_LIMIT, "请分批重发");
	const response = await app.request("/probe", {
		body: "x".repeat(SMALL_LIMIT + 1),
		method: "POST",
	});
	expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
	expect(await response.json()).toEqual({
		error: "payload-too-large",
		message: `请求体超过 ${SMALL_LIMIT} 字节；请分批重发`,
	});
});

test("声称的 content-length 就够大时，body 都不用读完就 413", async () => {
	const app = buildApp(SMALL_LIMIT, "请分批重发");
	const response = await app.request("/probe", {
		body: "tiny",
		headers: { "content-length": String(SMALL_LIMIT + 1) },
		method: "POST",
	});
	expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
});

test("413 的后半句各端点各说各的，不是一句通用文案", async () => {
	const app = buildApp(SMALL_LIMIT, "附件本体不走这个端点（它只收元数据）");
	const response = await app.request("/probe", {
		body: "x".repeat(SMALL_LIMIT + 1),
		method: "POST",
	});
	const body = (await response.json()) as { message: string };
	expect(body.message).toContain("附件本体不走这个端点");
	expect(body.message).toContain(String(SMALL_LIMIT));
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
