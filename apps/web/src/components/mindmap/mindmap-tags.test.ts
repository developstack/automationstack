import { describe, expect, it } from "vitest";

import {
	STATUS_TONE_CLASSES,
	type StatusTone,
} from "@/components/status/status-badge-meta";

import { buildNewCaseNode } from "./mindmap-node-utils.ts";
import {
	buildCaseStatusTag,
	buildPriorityTag,
	buildToneTag,
} from "./mindmap-tags.ts";

const TOKEN_REFERENCE = /var\(--[a-z-]+\)/;
const HEX_OR_RGB = /#[0-9a-f]{3,8}\b|rgb\(/i;

describe("用例状态标签：与统一状态标签的样式相同", () => {
	it("生效是绿色浅底，文字使用 soft-foreground 令牌", () => {
		const tag = buildCaseStatusTag("active");
		expect(tag.text).toBe("生效");
		expect(tag.style).toMatchObject({
			background: "var(--success-soft)",
			color: "var(--success-soft-foreground)",
		});
	});

	it("草稿是灰色描边，没有底色", () => {
		const tag = buildCaseStatusTag("draft");
		expect(tag.text).toBe("草稿");
		expect(tag.style).toMatchObject({
			background: "transparent",
			color: "var(--muted-foreground)",
		});
		expect(tag.style?.borderColor).toContain("var(--muted-foreground)");
	});

	it("废弃是灰色，文字带删除线", () => {
		const tag = buildCaseStatusTag("deprecated");
		expect(tag.text).toBe("废弃");
		expect(tag.style).toMatchObject({
			background: "var(--muted)",
			color: "var(--muted-foreground)",
			textDecoration: "line-through",
		});
	});

	it("颜色都引用令牌，所以暗色模式跟着切换", () => {
		for (const status of ["active", "deprecated", "draft"] as const) {
			const style = JSON.stringify(buildCaseStatusTag(status).style);
			expect(style).toMatch(TOKEN_REFERENCE);
			expect(style).not.toMatch(HEX_OR_RGB);
		}
	});
});

describe("优先级标签：不用颜色", () => {
	it("等宽字体的前景色文字，没有底色和边框色", () => {
		for (const priority of ["P0", "P1", "P2", "P3"] as const) {
			const tag = buildPriorityTag(priority);
			expect(tag.text).toBe(priority);
			expect(tag.style).toMatchObject({
				background: "transparent",
				borderColor: "transparent",
				color: "var(--foreground)",
				fontFamily: "var(--font-mono)",
			});
		}
	});

	it("只有 P0 加粗", () => {
		expect(buildPriorityTag("P0").style?.fontWeight).toBe("600");
		for (const priority of ["P1", "P2", "P3"] as const) {
			expect(buildPriorityTag(priority).style?.fontWeight).toBe("400");
		}
	});
});

describe("在脑图中新建的用例节点", () => {
	it("显示草稿和 P2，与服务端新建用例的默认值相同", () => {
		expect(buildNewCaseNode().tags).toEqual([
			buildCaseStatusTag("draft"),
			buildPriorityTag("P2"),
		]);
	});
});

const BG_CLASS = /(?:^|\s)bg-([a-z-]+)(?:\s|$)/;
const TEXT_COLOR_CLASS = /(?:^|\s)text-([a-z-]+)(?:\s|$)/;
const BORDER_CLASS = /(?:^|\s)border-([a-z-]+)\/(\d+)(?:\s|$)/;

describe("每种样式与 StatusBadge 的 STATUS_TONE_CLASSES 一致", () => {
	for (const [tone, classes] of Object.entries(STATUS_TONE_CLASSES)) {
		it(`${tone}：底色、文字色、边框色、删除线和字体相同`, () => {
			const style = buildToneTag("x", tone as StatusTone).style ?? {};
			const bg = classes.match(BG_CLASS)?.[1];
			expect(style.background).toBe(bg ? `var(--${bg})` : "transparent");
			expect(style.color).toBe(
				`var(--${classes.match(TEXT_COLOR_CLASS)?.[1]})`
			);
			const border = classes.match(BORDER_CLASS);
			if (border) {
				expect(style.borderColor).toContain(`var(--${border[1]})`);
				expect(style.borderColor).toContain(`${border[2]}%`);
			} else {
				expect(style.borderColor).toBe("transparent");
			}
			expect(style.textDecoration === "line-through").toBe(
				classes.includes("line-through")
			);
			expect(style.fontFamily === "var(--font-mono)").toBe(
				classes.includes("numeric")
			);
		});
	}
});
