import { describe, expect, it } from "vitest";

import {
	type BrowserProbe,
	detectLocalBrowsers,
	parseBrowserVersion,
} from "./detect-browsers";

/**
 * 探测的用例**全部走注入的假 probe**：断言不能依赖跑测试的这台机器上装了什么，
 * 否则同一份代码在 CI 上和在开发机上会得出不同的结论。
 */

const CHROME_MAC =
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_BETA_MAC =
	"/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta";
const SAFARI_MAC = "/Applications/Safari.app/Contents/MacOS/Safari";

function probeWith(input: {
	executables: readonly string[];
	pathDirs?: readonly string[];
	versions?: Record<string, string>;
}): BrowserProbe {
	const executables = new Set(input.executables);
	return {
		lookup: {
			isExecutable: (bin) => executables.has(bin),
			pathDirs: [...(input.pathDirs ?? ["/usr/bin"])],
		},
		readVersion: (bin) => input.versions?.[bin] ?? null,
	};
}

describe("parseBrowserVersion", () => {
	it.each([
		["Google Chrome 141.0.7390.54 ", "141.0.7390.54"],
		["Chromium 140.0.7339.80 snap", "140.0.7339.80"],
		["Microsoft Edge 141.0.3537.29", "141.0.3537.29"],
	])("从 %s 里取出 %s", (raw, expected) => {
		expect(parseBrowserVersion(raw)).toBe(expected);
	});

	it("读不出来（跑不起来、或输出里没有版本号）一律 null，不编一个占位值", () => {
		expect(parseBrowserVersion(null)).toBeNull();
		expect(parseBrowserVersion("command not found")).toBeNull();
	});
});

describe("detectLocalBrowsers", () => {
	it("什么都没装就如实回空清单（探测不抛，agent 照样起得来）", () => {
		expect(
			detectLocalBrowsers({
				platform: "darwin",
				probe: probeWith({ executables: [] }),
			})
		).toEqual([]);
	});

	it("macOS：认出 Chrome 与 Chrome Beta，通道分得开", () => {
		const found = detectLocalBrowsers({
			platform: "darwin",
			probe: probeWith({
				executables: [CHROME_MAC, CHROME_BETA_MAC],
				versions: {
					[CHROME_BETA_MAC]: "Google Chrome 142.0.7400.1 beta",
					[CHROME_MAC]: "Google Chrome 141.0.7390.54",
				},
			}),
		});
		expect(found).toEqual([
			{
				available: true,
				bin: CHROME_MAC,
				channel: "stable",
				name: "chrome",
				version: "141.0.7390.54",
			},
			{
				available: true,
				bin: CHROME_BETA_MAC,
				channel: "beta",
				name: "chrome",
				version: "142.0.7400.1",
			},
		]);
	});

	it("Safari 探得到但恒不可用，并把 D13 的理由带上", () => {
		const found = detectLocalBrowsers({
			platform: "darwin",
			probe: probeWith({ executables: [SAFARI_MAC] }),
		});
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ available: false, name: "safari" });
		expect(found[0]?.reason).toContain("D13");
	});

	it("Linux：PATH 里的同一个二进制换个名字不重复上报", () => {
		const found = detectLocalBrowsers({
			platform: "linux",
			probe: probeWith({
				executables: [
					"/usr/bin/google-chrome",
					"/usr/bin/google-chrome-stable",
				],
				versions: {
					"/usr/bin/google-chrome": "Google Chrome 141.0.7390.54",
					"/usr/bin/google-chrome-stable": "Google Chrome 141.0.7390.54",
				},
			}),
		});
		expect(found).toHaveLength(1);
		expect(found[0]?.bin).toBe("/usr/bin/google-chrome");
	});

	it("显式配置的 bin 排最前（运维的明确意图优先于我们猜的标准路径）", () => {
		const custom = "/opt/chrome/chrome";
		const found = detectLocalBrowsers({
			chromeBin: custom,
			platform: "darwin",
			probe: probeWith({
				executables: [custom, CHROME_MAC],
				versions: {
					[CHROME_MAC]: "Google Chrome 141.0.7390.54",
					[custom]: "Chromium 140.0.7339.80",
				},
			}),
		});
		expect(found[0]).toEqual({
			available: true,
			bin: custom,
			// 名字按 `--version` 的自称来，不按「配的是 CHROME_BIN」想当然。
			name: "chromium",
			version: "140.0.7339.80",
		});
		expect(found).toHaveLength(2);
	});

	it("配了一个不存在的路径：报 available:false，而不是从清单里消失", () => {
		const found = detectLocalBrowsers({
			chromeBin: "/opt/nope/chrome",
			platform: "linux",
			probe: probeWith({ executables: [] }),
		});
		expect(found).toHaveLength(1);
		expect(found[0]?.available).toBe(false);
		expect(found[0]?.reason).toContain("/opt/nope/chrome");
	});
});
