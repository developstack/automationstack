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

	it("选择「重命名」开始重命名", async () => {
		const { actions, trigger } = renderMenu();
		await choose(trigger, "重命名");
		expect(actions.onRename).toHaveBeenCalledOnce();
	});

	it("选择「新建子模块」开始新建子模块", async () => {
		const { actions, trigger } = renderMenu();
		await choose(trigger, "新建子模块");
		expect(actions.onCreateChild).toHaveBeenCalledOnce();
	});

	it("选择「删除」开始删除", async () => {
		const { actions, trigger } = renderMenu();
		await choose(trigger, "删除");
		expect(actions.onDelete).toHaveBeenCalledOnce();
	});
});
