import { describe, expect, it } from "vitest";

import { isSafeHttpUrl } from "@/components/test-runs/report-meta";

describe("isSafeHttpUrl", () => {
	it("放行 http / https", () => {
		expect(isSafeHttpUrl("https://jira.example.com/browse/PAY-1")).toBe(true);
		expect(isSafeHttpUrl("http://jira.example.com/browse/PAY-1")).toBe(true);
	});

	it("拦住 javascript: 及其大小写变体", () => {
		expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
		expect(isSafeHttpUrl("jAvAsCrIpT:alert(1)")).toBe(false);
		expect(isSafeHttpUrl("data:text/html,<script></script>")).toBe(false);
	});

	it("空值与非 URL 文本一律不当链接", () => {
		expect(isSafeHttpUrl(null)).toBe(false);
		expect(isSafeHttpUrl("")).toBe(false);
		expect(isSafeHttpUrl("见群里的聊天记录")).toBe(false);
	});
});
