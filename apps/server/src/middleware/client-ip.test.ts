import { describe, expect, it } from "vitest";

import { resolveClientIp } from "./client-ip";

const PROXY = "172.18.0.5";

describe("resolveClientIp", () => {
	it.each([
		["没有请求头：TCP 连接的地址", undefined, PROXY, PROXY],
		["X-Real-IP：请求头中的地址", "203.0.113.7", PROXY, "203.0.113.7"],
		["IPv6", "2001:db8::1", PROXY, "2001:db8::1"],
		["多个地址：最后一个", "6.6.6.6, 203.0.113.7", PROXY, "203.0.113.7"],
		["请求头不是 IP：TCP 连接的地址", "unknown", PROXY, PROXY],
		["请求头为空：TCP 连接的地址", "", PROXY, PROXY],
		["都没有：null", undefined, undefined, null],
	] as const)("%s", (_case, headerValue, socketAddress, expected) => {
		expect(resolveClientIp({ headerValue, socketAddress })).toBe(expected);
	});
});
