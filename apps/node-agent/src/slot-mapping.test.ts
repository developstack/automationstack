import type { AcquiredSlot } from "@automationstack/browser-slots";
import { describe, expect, it } from "vitest";

import { acquireResultOf, portFromEndpoint } from "./slot-mapping";

/** 断言用的正则一律提到顶层（规则要求，也免得每个用例重编译一次）。 */
const NO_PORT = /没有可用的端口号/;
const NOT_A_URL = /不是合法的 URL/;

function slotWith(overrides: Partial<AcquiredSlot>): AcquiredSlot {
	return {
		browserArgs: ["--headless=new"],
		cdpDebugPort: 9333,
		cdpHttpEndpoint: "http://127.0.0.1:32768",
		containerId: "local-s-1",
		readLogs: () => Promise.resolve(""),
		release: () => Promise.resolve(),
		wdEndpoint: null,
		...overrides,
	};
}

describe("portFromEndpoint", () => {
	it("取出端口", () => {
		expect(portFromEndpoint("http://127.0.0.1:32768", "CDP 端点")).toBe(32_768);
	});

	it("没有端口的端点是编程错误，直接抛", () => {
		expect(() => portFromEndpoint("http://127.0.0.1", "CDP 端点")).toThrow(
			NO_PORT
		);
	});

	it("压根不是 URL 时报的是「不是合法的 URL」，两种失败分开报", () => {
		expect(() => portFromEndpoint("127.0.0.1:9222", "CDP 端点")).toThrow(
			NOT_A_URL
		);
	});
});

describe("acquireResultOf", () => {
	it("cdp 模式：wdPort 为 null，cdpDebugPort 照抄不解析", () => {
		expect(acquireResultOf(slotWith({}))).toEqual({
			browserArgs: ["--headless=new"],
			cdpDebugPort: 9333,
			cdpPort: 32_768,
			containerId: "local-s-1",
			wdPort: null,
		});
	});

	it("webdriver 模式：wdPort 从 wdEndpoint 解出来", () => {
		const result = acquireResultOf(
			slotWith({ wdEndpoint: "http://127.0.0.1:41000" })
		);
		expect(result.wdPort).toBe(41_000);
	});

	it("browserArgs 是复制的一份，改它不会回写到槽位上", () => {
		const slot = slotWith({});
		acquireResultOf(slot).browserArgs.push("--mutated");
		expect(slot.browserArgs).toEqual(["--headless=new"]);
	});
});
