import { describe, expect, it } from "vitest";

import {
	browserCapabilitySchema,
	nodeCapabilitiesSchema,
} from "./capabilities";

/**
 * 能力形态是**唯一真相源**（`capabilities.ts` 文件头）：farm 的注册表、库里的
 * `farm_nodes.capabilities`、agent 的探测输出全都长这个样子。所以这组用例守的
 * 不是「zod 会不会工作」，而是几个**故意**开的口子不被后来的人当成漏写补上。
 */

const CHROME = {
	available: true,
	bin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	channel: "stable",
	name: "chrome",
	version: "140.0.7339.80",
};

describe("browserCapabilitySchema", () => {
	it("version 可空：Safari 没有 --version，docker 的 latest tag 也反解不出版本", () => {
		const parsed = browserCapabilitySchema.safeParse({
			available: false,
			name: "safari",
			reason: "本期不接入",
			version: null,
		});
		expect(parsed.success).toBe(true);
	});

	it("version 可空但不可是空串：那是「读失败」被伪装成了一个版本号", () => {
		expect(
			browserCapabilitySchema.safeParse({ ...CHROME, version: "" }).success
		).toBe(false);
	});

	it("available 必填：默认成 true 会让探测失败悄悄变成一条可用能力", () => {
		const { available: _available, ...withoutAvailable } = CHROME;
		expect(browserCapabilitySchema.safeParse(withoutAvailable).success).toBe(
			false
		);
	});

	it("channel / bin / reason 都是可选的", () => {
		expect(
			browserCapabilitySchema.safeParse({
				available: true,
				name: "chromium",
				version: "141.0.1",
			}).success
		).toBe(true);
	});
});

describe("nodeCapabilitiesSchema", () => {
	it("空清单是合法的：一台什么浏览器都没装的机器要能如实这么说", () => {
		const parsed = nodeCapabilitiesSchema.safeParse({
			backend: "local",
			browsers: [],
			detectedAtEpochSec: 1_760_000_000,
		});
		expect(parsed.success).toBe(true);
	});

	it("后端只认 local / docker，探测时刻必须是正整数", () => {
		expect(
			nodeCapabilitiesSchema.safeParse({
				backend: "k8s",
				browsers: [CHROME],
				detectedAtEpochSec: 1_760_000_000,
			}).success
		).toBe(false);
		expect(
			nodeCapabilitiesSchema.safeParse({
				backend: "docker",
				browsers: [CHROME],
				detectedAtEpochSec: 0,
			}).success
		).toBe(false);
	});
});
