import { afterEach, expect, it, vi } from "vitest";

import { IMAGE_CDN_SIGNATURE_VECTORS } from "../../../packages/api/src/lib/image-cdn-signature-vectors";
import worker from "./index";
import { createBucket, createCache } from "./test-fixtures";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it("fetch：使用 env 的 bucket 和密钥、caches.default 和 ctx.waitUntil", async () => {
	const [vector] = IMAGE_CDN_SIGNATURE_VECTORS;
	if (vector === undefined) {
		throw new Error("缺少签名测试向量");
	}
	vi.useFakeTimers({ now: (vector.exp - 60) * 1000 });
	const cache = createCache();
	vi.stubGlobal("caches", { default: cache });
	const bucket = createBucket({
		[vector.storageKey]: { body: "png-bytes", contentType: "image/png" },
	});
	const pending: Promise<unknown>[] = [];

	const response = await worker.fetch(
		new Request(
			`https://img.trendf.top/${vector.storageKey}?exp=${vector.exp}&sig=${vector.signature}`
		),
		{ CASE_IMAGES: bucket, IMAGE_CDN_SIGNING_SECRET: vector.secret },
		{ waitUntil: (promise) => pending.push(promise) }
	);
	await Promise.all(pending);

	expect(response.status).toBe(200);
	expect(response.headers.get("cache-control")).toBe("private, max-age=60");
	expect(bucket.calls).toEqual([`get:${vector.storageKey}`]);
	expect(cache.entries.size).toBe(1);
});
