import type { BrowserCapability } from "@automationstack/farm-node-protocol/capabilities";
import { describe, expect, it } from "vitest";

import { pickBrowserBin } from "./local-browser-pick";

const FALLBACK = "/fallback/chrome";

/** 断言用的正则一律提到顶层（仓库规约：正则不进函数体）。 */
const NON_CHROMIUM = /chromium 系/;
const NAMES_THE_BROWSER = /firefox/;

const BROWSERS: BrowserCapability[] = [
	{
		available: true,
		bin: "/opt/chrome-141",
		channel: "stable",
		name: "chrome",
		version: "141.0.7390.54",
	},
	{
		available: true,
		bin: "/opt/chromium-140",
		name: "chromium",
		version: "140.0.7339.80",
	},
	{
		available: false,
		bin: "/Applications/Safari.app/Contents/MacOS/Safari",
		name: "safari",
		reason: "本期不接入",
		version: null,
	},
];

function pick(name?: string, version?: string | null): string {
	return pickBrowserBin({
		browserName: name,
		browsers: BROWSERS,
		browserVersion: version,
		fallback: () => FALLBACK,
	});
}

describe("pickBrowserBin", () => {
	it("没点名就回落：内建源那条老调用路径逐字保持原行为", () => {
		expect(pick()).toBe(FALLBACK);
	});

	it("按名字选中，版本给 null = 哪个版本都行", () => {
		expect(pick("chromium", null)).toBe("/opt/chromium-140");
	});

	it("farm 常常只下发主版本，前缀匹配得认", () => {
		expect(pick("chrome", "141")).toBe("/opt/chrome-141");
	});

	it("点名了但清单里没这个版本：回落而不是报错（快照可能刚过期）", () => {
		expect(pick("chrome", "99")).toBe(FALLBACK);
	});

	it("不可用的条目不参与选择（Safari 在清单里，但永远选不中）", () => {
		expect(() => pick("safari")).toThrow(NON_CHROMIUM);
	});

	it("非 chromium 系当场报人话：chromedriver 驱动不了它，安静跑 Chrome 更糟", () => {
		expect(() => pick("firefox")).toThrow(NAMES_THE_BROWSER);
	});
});
