import { describe, expect, it } from "vitest";

import { requestOriginOf } from "./request-origin";

describe("requestOriginOf", () => {
	it.each([
		["http://localhost:3000/rpc/x", undefined, "http://localhost:3000"],
		["http://test.example.com/rpc/x", "https", "https://test.example.com"],
		[
			"http://test.example.com/rpc/x",
			"https, http",
			"https://test.example.com",
		],
		["http://test.example.com/rpc/x", "ftp", "http://test.example.com"],
	])("%s with X-Forwarded-Proto %s", (url, proto, expected) => {
		expect(requestOriginOf(url, proto)).toBe(expected);
	});
});
