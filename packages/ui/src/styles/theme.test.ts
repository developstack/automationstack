/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const THEME_CSS = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

const OKLCH_PATTERN =
	/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%?)?\s*\)$/;
const DECLARATION_PATTERN = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;
const VAR_REFERENCE_PATTERN = /^var\((--[a-z0-9-]+)\)$/;
const WCAG_AA_TEXT = 4.5;
// WCAG 1.4.11：图表色块等非文字元素的最低对比度
const WCAG_AA_GRAPHIC = 3;
const NEUTRAL_CHROMA_MAX = 0.02;
const PRIMARY_LIGHT_LIGHTNESS_MAX = 0.25;
const PRIMARY_DARK_LIGHTNESS_MIN = 0.9;
const LIGHT_BACKGROUND_LIGHTNESS_MIN = 0.94;
// 暖色调的色相范围：橙色到黄色
const WARM_HUE_MIN = 40;
const WARM_HUE_MAX = 100;

const STATUS_TOKENS = ["success", "destructive", "warning", "info"] as const;
const SURFACE_TOKENS = ["background", "card", "popover"] as const;
const SHADOW_TOKENS = ["--card-shadow", "--popover-shadow"] as const;
// 未测和跳过用灰色，故意不突出，所以不在这个列表中
const RESULT_FILL_TOKENS = [
	"result-passed",
	"result-failed",
	"result-blocked",
] as const;

type Mode = "light" | "dark";

function readBlock(selector: string): Map<string, string> {
	const start = THEME_CSS.indexOf(`${selector} {`);
	if (start === -1) {
		throw new Error(`theme.css 中没有 ${selector} 块`);
	}
	const end = THEME_CSS.indexOf("\n}", start);
	const body = THEME_CSS.slice(start, end);
	const tokens = new Map<string, string>();
	for (const [, name, value] of body.matchAll(DECLARATION_PATTERN)) {
		if (name !== undefined && value !== undefined) {
			tokens.set(name, value.trim());
		}
	}
	return tokens;
}

const TOKENS_BY_MODE: Record<Mode, Map<string, string>> = {
	dark: readBlock(".dark"),
	light: readBlock(":root"),
};

interface Oklch {
	alpha: number;
	chroma: number;
	hue: number;
	lightness: number;
}

function readToken(mode: Mode, name: string): string {
	const value = TOKENS_BY_MODE[mode].get(`--${name}`);
	if (value === undefined) {
		throw new Error(`${mode} 模式缺少 --${name}`);
	}
	const reference = VAR_REFERENCE_PATTERN.exec(value)?.[1];
	return reference === undefined
		? value
		: readToken(mode, reference.slice("--".length));
}

function parseOklch(value: string): Oklch {
	const match = OKLCH_PATTERN.exec(value);
	if (match === null) {
		throw new Error(`不是 oklch 颜色：${value}`);
	}
	const [, lightness, chroma, hue, alpha] = match;
	return {
		alpha: alpha === undefined ? 1 : Number(alpha) / 100,
		chroma: Number(chroma),
		hue: Number(hue),
		lightness: Number(lightness),
	};
}

// OKLab 到线性 sRGB 的系数取自 https://bottosson.github.io/posts/oklab/
function relativeLuminance({ lightness, chroma, hue }: Oklch): number {
	const radians = (hue * Math.PI) / 180;
	const a = chroma * Math.cos(radians);
	const b = chroma * Math.sin(radians);
	const l = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
	const m = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
	const s = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
	const clamp = (channel: number): number => Math.min(1, Math.max(0, channel));
	const red = clamp(
		4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s
	);
	const green = clamp(
		-1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s
	);
	const blue = clamp(
		-0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s
	);
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(mode: Mode, text: string, surface: string): number {
	const textLuminance = relativeLuminance(parseOklch(readToken(mode, text)));
	const surfaceLuminance = relativeLuminance(
		parseOklch(readToken(mode, surface))
	);
	const lighter = Math.max(textLuminance, surfaceLuminance);
	const darker = Math.min(textLuminance, surfaceLuminance);
	return (lighter + 0.05) / (darker + 0.05);
}

describe("relativeLuminance", () => {
	it("白色和黑色的对比度是 21:1", () => {
		const white = relativeLuminance(parseOklch("oklch(1 0 0)"));
		const black = relativeLuminance(parseOklch("oklch(0 0 0)"));
		expect((white + 0.05) / (black + 0.05)).toBeCloseTo(21, 1);
	});
});

describe.each(["light", "dark"] as const)("%s 模式的主题令牌", (mode) => {
	it.each(
		SURFACE_TOKENS.flatMap((surface) => [
			["foreground", surface],
			["muted-foreground", surface],
		])
	)("%s 在 %s 上达到 WCAG AA", (text, surface) => {
		expect(contrast(mode, text, surface)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
	});

	it.each([
		["primary-foreground", "primary"],
		["secondary-foreground", "secondary"],
		["muted-foreground", "muted"],
		["accent-foreground", "accent"],
		["sidebar-foreground", "sidebar"],
		["sidebar-accent-foreground", "sidebar-accent"],
		["sidebar-foreground", "sidebar-selected"],
		["sidebar-primary-foreground", "sidebar-primary"],
	])("%s 在 %s 上达到 WCAG AA", (text, surface) => {
		expect(contrast(mode, text, surface)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
	});

	it.each(STATUS_TOKENS)("状态色 %s 作为文字和底色都达到 WCAG AA", (status) => {
		for (const surface of SURFACE_TOKENS) {
			expect(
				contrast(mode, status, surface),
				`${status} 在 ${surface} 上`
			).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
		}
		expect(
			contrast(mode, `${status}-foreground`, status),
			`${status}-foreground 在 ${status} 上`
		).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
	});

	it.each(RESULT_FILL_TOKENS)("图表色 %s 在卡片上可以看清", (fill) => {
		for (const surface of SURFACE_TOKENS) {
			expect(
				contrast(mode, fill, surface),
				`${fill} 在 ${surface} 上`
			).toBeGreaterThanOrEqual(WCAG_AA_GRAPHIC);
		}
	});

	it("主按钮是中性色：浅色模式接近黑色，暗色模式接近白色", () => {
		const primary = parseOklch(readToken(mode, "primary"));
		expect(primary.chroma).toBeLessThanOrEqual(NEUTRAL_CHROMA_MAX);
		if (mode === "light") {
			expect(primary.lightness).toBeLessThan(PRIMARY_LIGHT_LIGHTNESS_MAX);
		} else {
			expect(primary.lightness).toBeGreaterThan(PRIMARY_DARK_LIGHTNESS_MIN);
		}
	});

	it("侧栏只用中性色，没有遗留的蓝色", () => {
		const sidebarTokens = [...TOKENS_BY_MODE[mode].entries()].filter(([name]) =>
			name.startsWith("--sidebar")
		);
		expect(sidebarTokens.length).toBeGreaterThan(0);
		for (const [name, value] of sidebarTokens) {
			expect(parseOklch(value).chroma, name).toBeLessThanOrEqual(
				NEUTRAL_CHROMA_MAX
			);
		}
	});

	it.each(SHADOW_TOKENS)("定义阴影令牌 %s", (name) => {
		expect(TOKENS_BY_MODE[mode].get(name)).toBeDefined();
	});
});

describe("浅色模式的底色", () => {
	it("底色是浅暖灰，卡片是白色", () => {
		const background = parseOklch(readToken("light", "background"));
		const card = parseOklch(readToken("light", "card"));
		expect(background.lightness).toBeGreaterThan(
			LIGHT_BACKGROUND_LIGHTNESS_MIN
		);
		expect(background.lightness).toBeLessThan(card.lightness);
		expect(background.chroma).toBeGreaterThan(0);
		expect(background.hue).toBeGreaterThanOrEqual(WARM_HUE_MIN);
		expect(background.hue).toBeLessThanOrEqual(WARM_HUE_MAX);
		expect(card).toMatchObject({ chroma: 0, lightness: 1 });
	});
});
