import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModuleRowMenu } from "@/components/workspace/module-row-menu";

function renderMenu() {
	const actions = {
		onCreateChild: vi.fn(),
		onDelete: vi.fn(),
		onRename: vi.fn(),
	};
	render(<ModuleRowMenu name="支付" {...actions} />);
	const trigger = screen.getByRole("button", { name: "模块「支付」更多操作" });
	return { actions, trigger };
}

async function choose(trigger: HTMLElement, item: string) {
	fireEvent.click(trigger);
	fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}

describe("ModuleRowMenu：模块行的「更多操作」菜单", () => {
	it("点击按钮打开菜单，列出重命名、新建子模块和删除", async () => {
		const { trigger } = renderMenu();
		fireEvent.click(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		const items = await screen.findAllByRole("menuitem");
		expect(items.map((item) => item.textContent)).toEqual([
			"重命名",
			"新建子模块",
			"删除",
		]);
	});

	it.each([
		["重命名", "onRename"],
		["新建子模块", "onCreateChild"],
		["删除", "onDelete"],
	] as const)("选择「%s」开始对应的操作（%s）", async (item, action) => {
		const { actions, trigger } = renderMenu();
		await choose(trigger, item);
		expect(actions[action]).toHaveBeenCalledOnce();
	});
});
