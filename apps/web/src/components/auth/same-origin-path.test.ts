import { describe, expect, it } from "vitest";

import { sameOriginPath } from "./same-origin-path";

describe("sameOriginPath", () => {
	it("接受本站路径，保留查询和锚点", () => {
		expect(sameOriginPath("/projects/p1?tab=runs#top")).toBe(
			"/projects/p1?tab=runs#top"
		);
	});

	it.each([
		undefined,
		"",
		"projects",
		"//evil.example.com/x",
		"/\\evil.example.com",
		"https://evil.example.com/projects",
		"javascript:alert(1)",
		// 浏览器解析地址时会去掉制表符和换行，"/\t/evil.example.com" 会变成 "//evil.example.com"
		"/\t/evil.example.com/x",
		"/\n/evil.example.com/x",
	])("拒绝 %s", (value) => {
		expect(sameOriginPath(value)).toBeUndefined();
	});
});
