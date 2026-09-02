import { describe, expect, it } from "vitest";

import {
	buildConnectSnippets,
	TOKEN_PLACEHOLDER,
	toWebSocketUrl,
} from "@/components/farm/connect-snippets";

describe("toWebSocketUrl", () => {
	it("http → ws，https → wss", () => {
		expect(toWebSocketUrl("http://localhost:3002")).toBe("ws://localhost:3002");
		expect(toWebSocketUrl("https://farm.example.com")).toBe(
			"wss://farm.example.com"
		);
	});

	it("去掉尾斜杠，认不出的前缀原样返回", () => {
		expect(toWebSocketUrl("http://localhost:3002///")).toBe(
			"ws://localhost:3002"
		);
		expect(toWebSocketUrl("ws://already-ws:3002")).toBe("ws://already-ws:3002");
	});
});

describe("buildConnectSnippets", () => {
	const snippets = buildConnectSnippets({
		farmUrl: "http://localhost:3002/",
		projectId: "11111111-2222-3333-4444-555555555555",
	});

	it("三段，id 唯一", () => {
		expect(snippets.map((snippet) => snippet.id)).toEqual([
			"selenium-python",
			"selenium-node",
			"playwright-node",
		]);
	});

	it("每段都填了当前项目的真实 projectId", () => {
		for (const snippet of snippets) {
			expect(snippet.code).toContain("11111111-2222-3333-4444-555555555555");
		}
	});

	it("token 一律留占位符，绝不填真值", () => {
		for (const snippet of snippets) {
			expect(snippet.code).toContain(TOKEN_PLACEHOLDER);
		}
	});

	it("两个 Selenium 段指向 /wd/hub，且尾斜杠已归一", () => {
		expect(snippets[0].code).toContain('"http://localhost:3002/wd/hub"');
		expect(snippets[1].code).toContain('"http://localhost:3002/wd/hub"');
	});

	it("Playwright 段用 ws:// 的 /cdp 查询串", () => {
		expect(snippets[2].code).toContain(
			`ws://localhost:3002/cdp?token=${TOKEN_PLACEHOLDER}&projectId=11111111-2222-3333-4444-555555555555&browser=chromium`
		);
	});

	it("projectId 参与拼 URL 时被转义", () => {
		const [, , playwright] = buildConnectSnippets({
			farmUrl: "http://localhost:3002",
			projectId: "a b&c",
		});
		expect(playwright.code).toContain("projectId=a%20b%26c");
	});
});
