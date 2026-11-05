import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaseStepsList } from "@/components/cases/case-steps-list";

const SHOT_A = "11111111-1111-4111-8111-11111111111a";
const SHOT_B = "11111111-1111-4111-8111-11111111111b";

const IMAGE_URLS = new Map<string, string | null>([
	[SHOT_A, "https://r2.example/a.png"],
	[SHOT_B, "https://r2.example/b.png"],
]);

const STEPS: CaseStep[] = [
	{ expected: "进入工作台", id: "s1", step: "输入账号密码" },
	{ expected: "", id: "s2", step: "" },
];

function renderList(steps: CaseStep[] = STEPS) {
	return render(<CaseStepsList imageUrls={IMAGE_URLS} steps={steps} />);
}

const EDITOR_GRID = "sm:grid-cols-case-step";

const SCREENSHOT_STRIP = /截图/;

function stepItems(container: HTMLElement): HTMLElement[] {
	return within(container.querySelector("ol") as HTMLElement)
		.getAllByRole("listitem")
		.filter((item) => item.parentElement?.tagName === "OL");
}

describe("CaseStepsList：只读的步骤是编号列表", () => {
	it("shows each step as a numbered list item, not a table", () => {
		const { container } = renderList();
		expect(container.querySelector("table")).toBeNull();
		const items = stepItems(container);
		expect(items.map((item) => item.firstElementChild?.textContent)).toEqual([
			"1",
			"2",
		]);
	});

	it.each([
		[0, "输入账号密码", "进入工作台"],
		[1, "—", "—"],
	])(
		"step %i shows 操作步骤 and 预期结果 side by side in the editor columns",
		(index, stepText, expectedText) => {
			const { container } = renderList();
			const item = stepItems(container)[index] as HTMLElement;
			expect(item.className).toContain(EDITOR_GRID);
			const [, stepCell, expectedCell] = [...item.children];
			expect(stepCell?.textContent).toBe(`操作步骤${stepText}`);
			expect(expectedCell?.textContent).toBe(`预期结果${expectedText}`);
			// 宽屏时列标题在表头，单元格的标签只留给读屏软件
			for (const cell of [stepCell, expectedCell]) {
				expect(cell?.firstElementChild?.className).toContain("sm:sr-only");
			}
		}
	);

	it("puts the editor's column headers above the steps", () => {
		const { container } = renderList();
		const [header, list] = [...(container.firstElementChild?.children ?? [])];
		expect(header?.className).toContain(EDITOR_GRID);
		expect(header?.textContent).toBe("#操作步骤预期结果");
		expect(list?.tagName).toBe("OL");
	});

	it("shows the images that the step text embeds, and not the old screenshots field", () => {
		const legacyStep = {
			expected: "",
			id: "s1",
			screenshots: [SHOT_B],
			step: `输入账号 ![](attachment:${SHOT_A})`,
		} as CaseStep;
		const { container } = renderList([legacyStep]);
		const images = [...container.querySelectorAll("img")];
		expect(images.map((image) => image.getAttribute("src"))).toEqual([
			"https://r2.example/a.png",
		]);
		// 没有截图的步骤不显示缩略图条，不占位置
		expect(screen.queryAllByRole("list", { name: SCREENSHOT_STRIP })).toEqual(
			[]
		);
		expect(stepItems(container)[0]?.children).toHaveLength(4);
	});

	it("shows each screenshot group under the text of its own column, and opens the group's lightbox", () => {
		const step: CaseStep = {
			actionScreenshots: [
				SHOT_A,
				SHOT_B,
				SHOT_A.replace("a", "c"),
				SHOT_B.replace("b", "d"),
			],
			expected: "进入工作台",
			expectedScreenshots: [SHOT_B],
			id: "s1",
			step: "输入账号",
		};
		const { container } = renderList([step]);
		const [, stepCell, expectedCell] = [
			...(stepItems(container)[0]?.children ?? []),
		];
		const actionStrip = within(stepCell as HTMLElement).getByRole("list", {
			name: "第 1 步操作截图",
		});
		expect(within(actionStrip).getAllByRole("button")).toHaveLength(4);
		expect(
			within(actionStrip).getByRole("button", { name: "查看另外 1 个" })
		).toBeTruthy();
		within(expectedCell as HTMLElement).getByRole("list", {
			name: "第 1 步预期截图",
		});
		fireEvent.click(
			within(actionStrip).getByRole("button", { name: "查看操作截图 2" })
		);
		expect(
			screen.getByRole("heading", { name: "第 1 步 · 操作截图 2/4" })
		).toBeTruthy();
	});

	it("shows the empty text when there are no steps", () => {
		render(
			<CaseStepsList emptyText="没有步骤" imageUrls={IMAGE_URLS} steps={[]} />
		);
		expect(screen.getByText("没有步骤")).toBeTruthy();
	});
});
