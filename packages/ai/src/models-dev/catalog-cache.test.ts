/**
 * 缓存层的两个不可回归点：抓取失败时**不能抛**（配置页要能降级），
 * 以及 TTL 到期后必须带 `If-None-Match` 走 304 续期而不是重下 4 MB。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCatalog, resetCatalogCacheForTests } from "./catalog-cache";

const ETAG = 'W/"abc123"';
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const HTTP_NOT_MODIFIED = 304;
const HTTP_SERVER_ERROR = 503;

const PAYLOAD = {
	deepseek: {
		api: "https://api.deepseek.com",
		id: "deepseek",
		models: { "deepseek-chat": { id: "deepseek-chat", name: "DeepSeek Chat" } },
		name: "DeepSeek",
	},
};

function okResponse(): Response {
	return new Response(JSON.stringify(PAYLOAD), {
		headers: { etag: ETAG },
		status: 200,
	});
}

function notModifiedResponse(): Response {
	return new Response(null, { status: HTTP_NOT_MODIFIED });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	resetCatalogCacheForTests();
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	resetCatalogCacheForTests();
});

describe("getCatalog 正常路径", () => {
	it("fetches once and serves the parsed catalog from memory afterwards", async () => {
		fetchMock.mockResolvedValue(okResponse());
		const first = await getCatalog();
		const second = await getCatalog();
		expect(first.status).toBe("ready");
		expect(second.catalog.get("deepseek")?.provider.name).toBe("DeepSeek");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("de-duplicates concurrent refreshes into a single upstream request", async () => {
		fetchMock.mockResolvedValue(okResponse());
		await Promise.all([getCatalog(), getCatalog(), getCatalog()]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("revalidates with If-None-Match once the TTL expires", async () => {
		fetchMock.mockResolvedValueOnce(okResponse());
		await getCatalog();
		fetchMock.mockResolvedValueOnce(notModifiedResponse());
		vi.advanceTimersByTime(SIX_HOURS_MS + 1);

		const snapshot = await getCatalog();

		expect(snapshot.status).toBe("ready");
		expect(snapshot.catalog.get("deepseek")).toBeDefined();
		const [, init] = fetchMock.mock.calls[1] ?? [];
		expect(init?.headers).toEqual({ "if-none-match": ETAG });
	});
});

describe("getCatalog 的降级行为", () => {
	it("reports unavailable with an empty catalog instead of throwing", async () => {
		fetchMock.mockRejectedValue(new Error("network down"));
		const snapshot = await getCatalog();
		expect(snapshot.status).toBe("unavailable");
		expect(snapshot.catalog.size).toBe(0);
	});

	it("treats a non-2xx response as a failure rather than parsing it", async () => {
		fetchMock.mockResolvedValue(
			new Response("upstream is down", { status: HTTP_SERVER_ERROR })
		);
		expect((await getCatalog()).status).toBe("unavailable");
	});

	it("backs off instead of hammering an upstream that is down", async () => {
		fetchMock.mockRejectedValue(new Error("network down"));
		await getCatalog();
		await getCatalog();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("keeps serving the stale catalog when a refresh fails", async () => {
		fetchMock.mockResolvedValueOnce(okResponse());
		await getCatalog();
		fetchMock.mockRejectedValue(new Error("network down"));
		vi.advanceTimersByTime(SIX_HOURS_MS + 1);

		const snapshot = await getCatalog();

		expect(snapshot.status).toBe("stale");
		expect(snapshot.catalog.get("deepseek")).toBeDefined();
	});
});
