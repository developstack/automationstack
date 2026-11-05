import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { MAX_INGEST_BODY_BYTES } from "../ingest/body-limit";
import {
	DEFAULT_MAX_BODY_BYTES,
	MAX_RPC_BODY_BYTES,
	requestBodyLimit,
} from "./request-body-limit";

const HTTP_OK = 200;
const HTTP_PAYLOAD_TOO_LARGE = 413;

function createApp(): Hono {
	const app = new Hono();
	app.use("/*", requestBodyLimit());
	app.post("/*", (c) => c.json({ ok: true }));
	return app;
}

function post(app: Hono, path: string, bytes: number) {
	return app.request(path, {
		body: "x".repeat(bytes),
		headers: { "content-type": "application/json" },
		method: "POST",
	});
}

describe("requestBodyLimit", () => {
	it("未登记的路径落到最小的兜底额度", async () => {
		const app = createApp();
		const ok = await post(app, "/whatever", DEFAULT_MAX_BODY_BYTES);
		expect(ok.status).toBe(HTTP_OK);

		const tooLarge = await post(app, "/whatever", DEFAULT_MAX_BODY_BYTES + 1);
		expect(tooLarge.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
		expect(await tooLarge.json()).toMatchObject({ error: "payload-too-large" });
	});

	it("/rpc 拿到比兜底更宽的额度", async () => {
		const app = createApp();
		const res = await post(app, "/rpc/auth/login", DEFAULT_MAX_BODY_BYTES + 1);
		expect(res.status).toBe(HTTP_OK);
	});

	it("额度按路由族分档，且 ingest 那档就是 ingest 自己的上限", () => {
		expect(MAX_INGEST_BODY_BYTES).toBeGreaterThan(MAX_RPC_BODY_BYTES);
		expect(MAX_RPC_BODY_BYTES).toBeGreaterThan(DEFAULT_MAX_BODY_BYTES);
	});
});
