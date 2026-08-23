import { describe, expect, it } from "vitest";

import { MINDMAP_THEME } from "./mindmap-theme.ts";

/**
 * 画布跟随亮/暗主题，靠的不是「切换时跑一段 JS」，而是所有颜色都写成
 * `var(--token)`：值在使用点才解析，`<html>` 上的 `.dark` 一变就整屏跟着变。
 * 一旦有人把某个值改成写死的 `#xxx` / `oklch(...)`，那一处就会永远停在一种外观，
 * 而且这种回归在暗色下自测通常看不出来——所以用测试把这条不变量钉住。
 */
const TOKEN_REFERENCE = /var\(--[a-z-]+\)/;

/** 只有颜色需要跟随主题；间距 / 圆角这些几何值不在此列。 */
const GEOMETRY_KEYS = new Set([
	"--main-gap-x",
	"--main-gap-y",
	"--main-radius",
	"--map-padding",
	"--node-gap-x",
	"--node-gap-y",
	"--root-radius",
	"--topic-padding",
]);

describe("MINDMAP_THEME", () => {
	it("每个颜色变量都引用设计令牌，而不是写死的颜色", () => {
		const entries = Object.entries(MINDMAP_THEME.cssVar ?? {});
		expect(entries.length).toBeGreaterThan(0);
		for (const [key, value] of entries) {
			if (GEOMETRY_KEYS.has(key)) {
				continue;
			}
			expect(value, `${key} 必须引用令牌`).toMatch(TOKEN_REFERENCE);
		}
	});

	it("主分支色同样引用令牌，切换主题时连线与节点边框才会跟着变", () => {
		expect(MINDMAP_THEME.palette.length).toBeGreaterThan(0);
		for (const color of MINDMAP_THEME.palette) {
			expect(color).toMatch(TOKEN_REFERENCE);
		}
	});
});
