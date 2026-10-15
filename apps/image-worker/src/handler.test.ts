import { describe, expect, it } from "vitest";

import { signImageCdnPath } from "../../../packages/api/src/lib/image-cdn-signature";
import { handleImageRequest, type ImageRequestDeps } from "./handler";
import { createBucket, createCache, type FakeObject } from "./test-fixtures";

const ORIGIN = "https://img.trendf.top";
const SECRET = "0123456789abcdef0123456789abcdef";
const KEY = "test-cases/project-1/case-1/image-1.png";
const MISSING_KEY = "test-cases/project-1/case-1/missing.png";
const OTHER_PREFIX_KEY = "test-runs/project-1/run-1/case-1/screenshot-1.png";
const NOW_SECONDS = 1_800_000_000;
const EXP = NOW_SECONDS + 1800;
const IMAGE: FakeObject = { body: "png-bytes", contentType: "image/png" };

async function signedUrl(key: string, exp = EXP): Promise<string> {
	const signature = await signImageCdnPath(key, exp, SECRET);
	return `${ORIGIN}/${key}?exp=${exp}&sig=${signature}`;
}

function setup(objects: Record<string, FakeObject> = { [KEY]: IMAGE }) {
	const bucket = createBucket(objects);
	const cache = createCache();
	const pending: Promise<unknown>[] = [];
	const deps: ImageRequestDeps = {
		bucket,
		cache,
		now: () => NOW_SECONDS * 1000,
		secret: SECRET,
		waitUntil: (promise) => pending.push(promise),
	};
	const send = async (url: string, method = "GET"): Promise<Response> => {
		const response = await handleImageRequest(
			new Request(url, { method }),
			deps
		);
		await Promise.all(pending);
		return response;
	};
	return { bucket, cache, deps, send };
}

describe("handleImageRequest：拒绝的请求不读取 R2 和缓存", () => {
	it.each([
		["修改过的签名", async () => `${await signedUrl(KEY)}x`],
		["没有签名", () => `${ORIGIN}/${KEY}?exp=${EXP}`],
		["没有 exp", async () => (await signedUrl(KEY)).replace(`exp=${EXP}&`, "")],
		[
			"exp 不是整数",
			async () => (await signedUrl(KEY)).replace(`exp=${EXP}`, "exp=1e9"),
		],
		[
			"exp 被修改",
			async () =>
				(await signedUrl(KEY)).replace(`exp=${EXP}`, `exp=${EXP + 1}`),
		],
		["链接过期", () => signedUrl(KEY, NOW_SECONDS)],
		["签名正确但前缀不是 test-cases/", () => signedUrl(OTHER_PREFIX_KEY)],
		[
			"签名正确但对象键包含空段",
			() => signedUrl("test-cases//case-1/image-1.png"),
		],
		[
			"路径的编码不合法",
			() => `${ORIGIN}/test-cases/%E0%A4%A?exp=${EXP}&sig=x`,
		],
	])("%s：403", async (_name, buildUrl) => {
		const { bucket, cache, send } = setup();
		const response = await send(await buildUrl());
		expect(response.status).toBe(403);
		expect(bucket.calls).toEqual([]);
		expect(cache.entries.size).toBe(0);
	});

	it("GET 和 HEAD 以外的方法：405", async () => {
		const { bucket, send } = setup();
		const response = await send(await signedUrl(KEY), "POST");
		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET, HEAD");
		expect(bucket.calls).toEqual([]);
	});

	it("Worker 没有配置签名密钥：500", async () => {
		const { bucket, deps } = setup();
		const response = await handleImageRequest(
			new Request(await signedUrl(KEY)),
			{ ...deps, secret: undefined }
		);
		expect(response.status).toBe(500);
		expect(bucket.calls).toEqual([]);
	});
});

async function expectImage(
	response: Response,
	cacheStatus: "HIT" | "MISS"
): Promise<void> {
	expect(response.status).toBe(200);
	await expect(response.text()).resolves.toBe(IMAGE.body);
	expect(response.headers.get("content-type")).toBe("image/png");
	expect(response.headers.get("cache-control")).toBe("private, max-age=1800");
	expect(response.headers.get("cf-cache-status")).toBe(cacheStatus);
}

describe("handleImageRequest：签名正确", () => {
	it.each([
		["GET", "get"],
		["HEAD", "head"],
	])("%s 对象不存在：404，不写入缓存", async (method, operation) => {
		const { bucket, cache, send } = setup();
		const response = await send(await signedUrl(MISSING_KEY), method);
		expect(response.status).toBe(404);
		expect(bucket.calls).toEqual([`${operation}:${MISSING_KEY}`]);
		expect(cache.entries.size).toBe(0);
	});

	it("第一次 GET 从 R2 读取并放入缓存，第二次从缓存返回", async () => {
		const { bucket, cache, send } = setup();
		const first = await send(await signedUrl(KEY));
		const second = await send(await signedUrl(KEY));
		await expectImage(first, "MISS");
		await expectImage(second, "HIT");
		expect(bucket.calls).toEqual([`get:${KEY}`]);
		expect([...cache.entries.keys()]).toEqual([`${ORIGIN}/${KEY}`]);
		expect(
			cache.entries.get(`${ORIGIN}/${KEY}`)?.headers.get("cache-control")
		).toBe("public, max-age=2592000");
	});

	it("缓存键不包含查询参数：另一个 exp 的链接命中同一个缓存，max-age 按新的 exp 计算", async () => {
		const { bucket, send } = setup();
		await send(await signedUrl(KEY));
		const nextHour = await send(await signedUrl(KEY, EXP + 3600));
		expect(nextHour.headers.get("cf-cache-status")).toBe("HIT");
		expect(nextHour.headers.get("cache-control")).toBe("private, max-age=5400");
		expect(bucket.calls).toEqual([`get:${KEY}`]);
	});

	it("HEAD 没有命中缓存：从 R2 读取元数据，不返回响应体，不写入缓存", async () => {
		const { bucket, cache, send } = setup();
		const response = await send(await signedUrl(KEY), "HEAD");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(response.headers.get("cf-cache-status")).toBe("MISS");
		expect(response.body).toBeNull();
		expect(bucket.calls).toEqual([`head:${KEY}`]);
		expect(cache.entries.size).toBe(0);
	});

	it("HEAD 命中 GET 写入的缓存：不读取 R2，不返回响应体", async () => {
		const { bucket, send } = setup();
		await send(await signedUrl(KEY));
		const response = await send(await signedUrl(KEY), "HEAD");
		expect(response.headers.get("cf-cache-status")).toBe("HIT");
		expect(response.body).toBeNull();
		expect(bucket.calls).toEqual([`get:${KEY}`]);
	});

	it("R2 对象没有 Content-Type：返回 application/octet-stream", async () => {
		const { send } = setup({ [KEY]: { body: "bytes" } });
		const response = await send(await signedUrl(KEY));
		expect(response.headers.get("content-type")).toBe(
			"application/octet-stream"
		);
	});

	it("对象键中的编码字符：解码后读取 R2", async () => {
		const key = "test-cases/p/c/图片 1.jpg";
		const { bucket, send } = setup({ [key]: IMAGE });
		const url = await signedUrl(key);
		const encoded = url.replace("图片 1.jpg", encodeURIComponent("图片 1.jpg"));
		const response = await send(encoded);
		expect(response.status).toBe(200);
		expect(bucket.calls).toEqual([`get:${key}`]);
	});
});
