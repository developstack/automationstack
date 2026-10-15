import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MarkdownTextSize } from "@/components/cases/heading";
import { MarkdownRender } from "@/components/cases/markdown-render";

const HEADINGS_TEXT = "# 一级\n\n## 二级\n\n### 三级\n\n#### 四级\n\n正文";

const MARGIN_TOP_CLASS = /\bmt-/;
const FONT_SIZES = ["text-xs", "text-sm", "text-base", "text-lg"] as const;

function renderMarkdown(text: string, textSize?: MarkdownTextSize) {
	const { container } = render(
		<MarkdownRender text={text} textSize={textSize} />
	);
	return container.firstElementChild as HTMLElement;
}

function headingStyle(level: number): string {
	const heading = screen.getByRole("heading", { level });
	const size = FONT_SIZES.find((name) => heading.classList.contains(name));
	const weight = heading.classList.contains("font-semibold")
		? "semibold"
		: "medium";
	return `${size} ${weight}`;
}

describe("MarkdownRender：渲染后的 Markdown 有清楚的层级", () => {
	it.each([
		{
			body: "text-sm",
			expected: [
				"text-lg semibold",
				"text-base semibold",
				"text-sm semibold",
				"text-sm medium",
			],
			textSize: "sm",
		},
		{
			body: "text-xs",
			expected: [
				"text-sm semibold",
				"text-sm medium",
				"text-xs semibold",
				"text-xs medium",
			],
			textSize: "xs",
		},
	] as const)(
		"textSize=$textSize：H1 到 H4 的字号或字重各不相同",
		({ body, expected, textSize }) => {
			const root = renderMarkdown(HEADINGS_TEXT, textSize);
			expect(root.classList.contains(body)).toBe(true);
			const styles = [1, 2, 3, 4].map(headingStyle);
			expect(styles).toEqual(expected);
			const h4 = screen.getByRole("heading", { level: 4 });
			expect(h4.classList.contains("text-muted-foreground")).toBe(true);
		}
	);

	it.each([
		["sm", "mt-4"],
		["xs", "mt-3"],
	] as const)(
		"textSize=%s：标题上方的间距（%s）大于段落之间的间距（space-y-2），第一个块不加",
		(textSize, headingGap) => {
			const root = renderMarkdown("# 开头\n\n段落\n\n## 中间", textSize);
			expect(root.classList.contains("space-y-2")).toBe(true);
			for (const heading of screen.getAllByRole("heading")) {
				expect(heading.classList.contains(headingGap)).toBe(true);
				expect(heading.classList.contains("first:mt-0")).toBe(true);
			}
			expect(screen.getByText("段落").className).not.toMatch(MARGIN_TOP_CLASS);
		}
	);

	it("代码块有主题的边框", () => {
		const root = renderMarkdown("```\nconst a = 1;\n```");
		const pre = root.querySelector("pre");
		expect(pre?.classList.contains("border")).toBe(true);
		expect(pre?.classList.contains("border-border")).toBe(true);
		expect(pre?.textContent).toBe("const a = 1;");
	});

	it.each([
		["- 甲\n- 乙", "ul", "list-disc"],
		["1. 甲\n2. 乙", "ol", "list-decimal"],
	])("列表 %j 的标记有单独的颜色和字重", (text, tag, listStyle) => {
		const list = renderMarkdown(text).querySelector(tag);
		expect(list?.classList.contains(listStyle)).toBe(true);
		expect(list?.classList.contains("marker:text-foreground")).toBe(true);
		expect(list?.classList.contains("marker:font-semibold")).toBe(true);
		expect(screen.getAllByRole("listitem")).toHaveLength(2);
	});

	it("引用和列表中的标题使用同一档字号", () => {
		renderMarkdown("> ### 引用标题\n\n- #### 列表标题", "xs");
		const quoted = screen.getByRole("heading", { level: 3 });
		expect(quoted.closest("blockquote")).not.toBeNull();
		expect(quoted.classList.contains("text-xs")).toBe(true);
		const listed = screen.getByRole("heading", { level: 4 });
		expect(listed.closest("li")).not.toBeNull();
		expect(listed.classList.contains("text-xs")).toBe(true);
	});
});
