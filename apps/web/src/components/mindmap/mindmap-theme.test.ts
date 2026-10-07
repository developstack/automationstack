import { describe, expect, it } from "vitest";

import { MINDMAP_THEME } from "./mindmap-theme.ts";

const TOKEN_REFERENCE = /var\(--[a-z-]+\)/;

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
