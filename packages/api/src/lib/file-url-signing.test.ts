import { afterEach, describe, expect, it, vi } from "vitest";

import {
	checkDownloadQuery,
	checkUploadQuery,
	downloadQuery,
	roundedExpiry,
	uploadQuery,
} from "./file-url-signing";

vi.mock("@automationstack/env/server", () => ({
	env: { SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789" },
}));

const KEY = "test-runs/p/r/c/screenshot-1.png";
const NOW_SECONDS = 1_800_000_000;
const MS_PER_SECOND = 1000;
const GRANT = {
	contentLength: 2048,
	contentType: "image/png",
	expiresAt: NOW_SECONDS + 300,
};

function at(seconds: number) {
	vi.useFakeTimers({ now: seconds * MS_PER_SECOND });
}

afterEach(() => {
	vi.useRealTimers();
});

function tampered(query: string, name: string, value: string): URLSearchParams {
	const params = new URLSearchParams(query);
	params.set(name, value);
	return params;
}

describe("上传地址：签名包含对象键、类型、大小和过期时间", () => {
	it("accepts the signed query and returns the grant", () => {
		at(NOW_SECONDS);
		const query = new URLSearchParams(uploadQuery(KEY, GRANT));
		expect(checkUploadQuery(KEY, query)).toEqual({ kind: "ok", value: GRANT });
	});

	it.each([
		["another size", "size", "4096"],
		["another type", "type", "image/jpeg"],
		["a later expiry", "expires", String(NOW_SECONDS + 9999)],
		["another signature", "signature", "abc"],
	])("rejects %s", (_name, field, value) => {
		at(NOW_SECONDS);
		const query = tampered(uploadQuery(KEY, GRANT), field, value);
		expect(checkUploadQuery(KEY, query)).toEqual({ kind: "invalid" });
	});

	it("rejects the same query for another key, and after it expires", () => {
		at(NOW_SECONDS);
		const query = new URLSearchParams(uploadQuery(KEY, GRANT));
		expect(checkUploadQuery(`${KEY}x`, query)).toEqual({ kind: "invalid" });
		at(GRANT.expiresAt + 1);
		expect(checkUploadQuery(KEY, query)).toEqual({ kind: "expired" });
	});

	it("does not accept a download signature as an upload signature", () => {
		const query = new URLSearchParams(downloadQuery(KEY, GRANT.expiresAt));
		query.set("size", "2048");
		query.set("type", "image/png");
		expect(checkUploadQuery(KEY, query)).toEqual({ kind: "invalid" });
	});
});

describe("下载地址", () => {
	it("a link without expiry has only a signature and never expires", () => {
		const query = new URLSearchParams(downloadQuery(KEY, null));
		expect([...query.keys()]).toEqual(["signature"]);
		at(NOW_SECONDS * 2);
		expect(checkDownloadQuery(KEY, query)).toEqual({ kind: "ok", value: null });
		expect(checkDownloadQuery(`${KEY}x`, query)).toEqual({ kind: "invalid" });
	});

	it("a link with expiry is valid until it expires, and the expiry is signed", () => {
		at(NOW_SECONDS);
		const query = downloadQuery(KEY, NOW_SECONDS + 60);
		expect(checkDownloadQuery(KEY, new URLSearchParams(query))).toEqual({
			kind: "ok",
			value: NOW_SECONDS + 60,
		});
		expect(
			checkDownloadQuery(
				KEY,
				tampered(query, "expires", String(NOW_SECONDS + 999))
			)
		).toEqual({ kind: "invalid" });
		at(NOW_SECONDS + 61);
		expect(checkDownloadQuery(KEY, new URLSearchParams(query))).toEqual({
			kind: "expired",
		});
	});

	it("roundedExpiry gives the same value inside one TTL window, valid for TTL to 2 × TTL", () => {
		const ttl = 900;
		const windowStart = NOW_SECONDS - (NOW_SECONDS % ttl);
		at(windowStart);
		const first = roundedExpiry(ttl);
		at(windowStart + ttl - 1);
		expect(roundedExpiry(ttl)).toBe(first);
		expect(first - windowStart).toBe(2 * ttl);
	});
});
