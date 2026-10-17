import type { CaseStep } from "@automationstack/db/schema/test-cases";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaseStepsList } from "@/components/cases/case-steps-list";

const SHOT_A = "11111111-1111-4111-8111-11111111111a";
const SHOT_B = "11111111-1111-4111-8111-11111111111b";

const IMAGE_URLS = new Map<string, string | null>([
	[SHOT_A, "https://r2.example/a.png"],
	[SHOT_B, "https://r2.example/b.png"],
]);

const STEPS: CaseStep[] = [
	{
		expected: "进入工作台",
		id: "s1",
		screenshots: [SHOT_A, SHOT_B],
		step: "输入账号密码",
	},
	{ expected: "", id: "s2", step: "" },
];

function renderList(onRemoveScreenshot?: (s: string, a: string) => void) {
	return render(
		<CaseStepsList
			imageUrls={IMAGE_URLS}
			onRemoveScreenshot={onRemoveScreenshot}
			steps={STEPS}
		/>
	);
}

const THUMB_NAME = /^放大查看/;

const thumbs = () => screen.getAllByRole("button", { name: THUMB_NAME });

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

	it("shows a screenshot strip only for steps with screenshots", () => {
		renderList();
		// 截图在两栏文字的下面，与编辑模式一致
		expect(
			screen.getByRole("list", { name: "第 1 步截图" }).className
		).toContain("sm:col-span-2 sm:col-start-2");
		expect(screen.queryByRole("list", { name: "第 2 步截图" })).toBeNull();
	});

	it("shows the empty text when there are no steps", () => {
		render(
			<CaseStepsList emptyText="没有步骤" imageUrls={IMAGE_URLS} steps={[]} />
		);
		expect(screen.getByText("没有步骤")).toBeTruthy();
	});

	it("renders every thumbnail as a 120×90 native button with object-cover", () => {
		renderList();
		for (const thumb of thumbs()) {
			expect(thumb.tagName).toBe("BUTTON");
			expect(thumb.className).toContain("h-22.5 w-30");
			const image = thumb.querySelector("img");
			expect(image?.getAttribute("width")).toBe("120");
			expect(image?.getAttribute("height")).toBe("90");
			expect(image?.className).toContain("object-cover");
		}
	});

	it.each([
		[0, "1 / 2"],
		[1, "2 / 2"],
	])("opens the lightbox at thumbnail %i (%s)", (index, counter) => {
		renderList();
		fireEvent.click(thumbs()[index] as HTMLElement);
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(screen.getByText(counter)).toBeTruthy();
	});
	it("closes the lightbox with Esc and returns focus to the thumbnail", async () => {
		renderList();
		const thumb = thumbs()[1] as HTMLElement;
		fireEvent.click(thumb);
		fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(thumb));
	});
});

describe("CaseStepsList：删除步骤截图", () => {
	it("has no delete button without a remove handler", () => {
		renderList();
		expect(screen.queryByRole("button", { name: "删除截图" })).toBeNull();
	});

	it.each([
		["删除截图", [["s1", SHOT_B]]],
		["取消", []],
	])("asks before deleting; %s", (choice, calls) => {
		const remove = vi.fn();
		renderList(remove);
		const buttons = screen.getAllByRole("button", { name: "删除截图" });
		fireEvent.click(buttons[1] as HTMLElement);
		expect(remove).not.toHaveBeenCalled();
		const dialog = screen.getByRole("alertdialog");
		fireEvent.click(within(dialog).getByRole("button", { name: choice }));
		expect(remove.mock.calls).toEqual(calls);
	});
});
