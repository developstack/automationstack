import { describe, expect, it } from "vitest";

import { imagesToCapabilities, parseImageBrowser } from "./image-browser";

/**
 * 解析规则本身的用例在 `apps/farm/src/nodes/pick-source.test.ts`（它从这个包
 * import，函数搬家时那组断言一个字没改）。这里只补两件搬家之后才出现的事：
 * 镜像清单怎么变成能力条目，以及 registry 前缀里的端口不能被当成 tag。
 */

describe("imagesToCapabilities", () => {
	it("已拉取的 tag 逐条映射成能力，bin 存原始 tag", () => {
		expect(
			imagesToCapabilities([
				"automationstack-browser-chromium:140",
				"automationstack-browser-chromium:latest",
			])
		).toEqual([
			{
				available: true,
				bin: "automationstack-browser-chromium:140",
				name: "chromium",
				version: "140",
			},
			{
				// `latest` = 「哪个版本都行」，翻成 null 而不是原样当版本号报上去。
				available: true,
				bin: "automationstack-browser-chromium:latest",
				name: "chromium",
				version: null,
			},
		]);
	});

	it("registry 前缀里的端口不是 tag", () => {
		expect(parseImageBrowser("host:5000/qa/browser-edge:141")).toEqual({
			browserName: "edge",
			browserVersion: "141",
		});
	});
});
