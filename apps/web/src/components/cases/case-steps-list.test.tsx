import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { render, screen, within } from "@testing-library/react";
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
		expect(screen.queryByRole("list", { name: "第 1 步截图" })).toBeNull();
		// 编号、操作步骤、预期结果和行尾占位，没有截图行
		expect(stepItems(container)[0]?.children).toHaveLength(4);
	});

	it("shows the empty text when there are no steps", () => {
		render(
			<CaseStepsList emptyText="没有步骤" imageUrls={IMAGE_URLS} steps={[]} />
		);
		expect(screen.getByText("没有步骤")).toBeTruthy();
	});
});
