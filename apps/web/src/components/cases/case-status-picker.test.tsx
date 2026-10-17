import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaseStatusPicker } from "@/components/cases/case-status-picker";

const TRIGGER_NAME = "修改用例「登录成功」的状态，当前为生效";

function renderPicker(status: CaseStatus = "active") {
	const onChange = vi.fn();
	render(
		<CaseStatusPicker caseName="登录成功" onChange={onChange} status={status} />
	);
	const trigger = screen.getByRole("button", { name: TRIGGER_NAME });
	return { onChange, trigger };
}

async function openByClick(trigger: HTMLElement) {
	fireEvent.click(trigger);
	return await screen.findByRole("menu", { name: TRIGGER_NAME });
}

describe("CaseStatusPicker：点状态标签修改用例状态", () => {
	it("菜单以标签的名称命名，列出草稿、生效和废弃，当前状态有选中标记", async () => {
		const { trigger } = renderPicker();
		await openByClick(trigger);
		const items = screen.getAllByRole("menuitemradio");
		expect(
			items.map((item) => [item.textContent, item.getAttribute("aria-checked")])
		).toEqual([
			["草稿", "false"],
			["生效", "true"],
			["废弃", "false"],
		]);
	});

	it.each<[string, string, CaseStatus | null]>([
		["选中其他状态：立刻修改为这个状态", "废弃", "deprecated"],
		["选中当前状态：不修改", "生效", null],
	])("%s", async (_name, label, expected) => {
		const { onChange, trigger } = renderPicker();
		await openByClick(trigger);
		fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		expect(onChange.mock.calls).toEqual(expected === null ? [] : [[expected]]);
	});

	it("可以用键盘打开并选择", async () => {
		const { onChange, trigger } = renderPicker();
		trigger.focus();
		fireEvent.keyDown(trigger, { key: "ArrowDown" });
		await screen.findByRole("menu", { name: TRIGGER_NAME });
		const deprecated = screen.getByRole("menuitemradio", { name: "废弃" });
		fireEvent.keyDown(deprecated, { key: "Enter" });
		expect(onChange).toHaveBeenCalledWith("deprecated");
	});

	it("点击标签和菜单项的事件停在选择器，不传给所在的行", async () => {
		const rowClick = vi.fn();
		document.addEventListener("click", rowClick);
		const { trigger } = renderPicker();
		await openByClick(trigger);
		fireEvent.click(screen.getByRole("menuitemradio", { name: "草稿" }));
		document.removeEventListener("click", rowClick);
		expect(rowClick).not.toHaveBeenCalled();
	});
});
