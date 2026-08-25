import { Hono } from "hono";
import { expect, test } from "vitest";

import {
	ingestBodyLimit,
	MAX_INGEST_ATTACHMENT_BODY_BYTES,
	MAX_INGEST_BODY_BYTES,
} from "./body-limit";
import { HTTP_PAYLOAD_TOO_LARGE } from "./responses";

/**
 * 请求体硬上限那道闸。
 *
 * 两件事要有回归保护：**超限的确实被拒**（否则 `JSON.parse` 会去啃一个几十 MB
 * 的字符串），以及**两档常量的相对关系**——附件那档小一个数量级是刻意的，
 * 而它又必须盖得住契约本身会受理的最大一次请求，否则超限时上报方拿到的
 * 是一句「太大了」而不是一条指着字段名的 400。
 */

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
	// 这道闸的意义正在于此：拒在解析之前，而不是先花掉一次全量解析。
	const app = buildApp(SMALL_LIMIT, "请分批重发");
	const response = await app.request("/probe", {
		body: "tiny",
		headers: { "content-length": String(SMALL_LIMIT + 1) },
		method: "POST",
	});
	expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
});

test("413 的后半句各端点各说各的，不是一句通用文案", async () => {
	// 附件那两条必须先说清「附件本体根本不走这个端点」，否则人只会去把文件切小，
	// 而那和这道闸无关。
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
	// `MAX_INGEST_ATTACHMENTS_PER_REQUEST`（2000）条 × 每条约 1.7 KB ≈ 3.4 MB，
	// 见 `body-limit.ts` 里那段算式。低于它就意味着有一类请求 zod 明明收得下，
	// 上报方却只能拿到一句「太大了」。
	const worstCaseContractBytes = 2000 * 1700;
	expect(MAX_INGEST_ATTACHMENT_BODY_BYTES).toBeGreaterThan(
		worstCaseContractBytes
	);
});
