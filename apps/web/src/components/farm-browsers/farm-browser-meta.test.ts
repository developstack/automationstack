import { describe, expect, it } from "vitest";

import {
	browserDisplayName,
	validateBrowserName,
	validateImage,
	validateVersion,
} from "@/components/farm-browsers/farm-browser-meta";

describe("validateBrowserName", () => {
	it("合法值返回 null", () => {
		expect(validateBrowserName("chromium")).toBeNull();
		expect(validateBrowserName("ms-edge")).toBeNull();
		expect(validateBrowserName(" firefox ")).toBeNull();
	});

	it("空值与纯空格都算空", () => {
		expect(validateBrowserName("")).toBe("浏览器名不能为空");
		expect(validateBrowserName("   ")).toBe("浏览器名不能为空");
	});

	// 服务端（packages/api/src/schemas/farm.ts）只做 trim + 长度，不校验格式。
	// 前端跟着放宽：挡住后端接受的值，用户只会看到一句莫名其妙的拒绝。
	it("大写与空格不再被挡下——服务端本来就收", () => {
		expect(validateBrowserName("Chrome")).toBeNull();
		expect(validateBrowserName("ms edge")).toBeNull();
	});

	it("超长按 trim 之后的长度算，上限与服务端的 64 对齐", () => {
		expect(validateBrowserName(`  ${"a".repeat(64)}  `)).toBeNull();
		expect(validateBrowserName("a".repeat(65))).toBe("浏览器名最多 64 个字符");
	});
});

describe("validateVersion", () => {
	it("数字、单词、点号都收", () => {
		expect(validateVersion("124")).toBeNull();
		expect(validateVersion("stable")).toBeNull();
		expect(validateVersion("124.0.6367.60")).toBeNull();
	});

	it("只挡空值：含空格的版本服务端也收", () => {
		expect(validateVersion("")).toBe("版本不能为空");
		expect(validateVersion("124 beta")).toBeNull();
		expect(validateVersion("a".repeat(65))).toBe("版本最多 64 个字符");
	});
});

describe("validateImage", () => {
	it("带 registry / tag / digest 的引用都收", () => {
		expect(validateImage("selenoid/chrome:124.0")).toBeNull();
		expect(
			validateImage("ghcr.io/org/chrome@sha256:0123456789abcdef")
		).toBeNull();
	});

	it("只挡空值：含空格的引用服务端也收", () => {
		expect(validateImage("  ")).toBe("镜像不能为空");
		expect(validateImage("selenoid/chrome :124")).toBeNull();
	});

	it("超长按 trim 之后的长度算，上限与服务端的 512 对齐", () => {
		expect(validateImage("i".repeat(512))).toBeNull();
		expect(validateImage("i".repeat(513))).toBe("镜像最多 512 个字符");
	});
});

describe("browserDisplayName", () => {
	it("名与版本一起念，两行只差版本时才分得开", () => {
		expect(browserDisplayName({ browser: "chromium", version: "124" })).toBe(
			"chromium 124"
		);
	});
});
