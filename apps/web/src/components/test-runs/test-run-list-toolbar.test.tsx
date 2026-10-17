import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { TestRunListToolbar } from "@/components/test-runs/test-run-list-toolbar";

function renderToolbar(onStatusChange = vi.fn()) {
	render(
		<TestRunListToolbar
			count={0}
			loaded
			onKeywordChange={vi.fn()}
			onStatusChange={onStatusChange}
			search={{}}
		/>
	);
	return screen.getByRole("combobox", { name: "按状态筛选测试任务" });
}

it("不选状态时，筛选写明不含已作废的测试任务", () => {
	expect(renderToolbar().textContent).toContain("全部（不含已作废）");
});

it("状态筛选有「已作废」，选中后只按已作废筛选", async () => {
	const onStatusChange = vi.fn();
	fireEvent.click(renderToolbar(onStatusChange));
	// Base UI 只接受从选项上按下的鼠标点击，所以先按下再点击
	const voided = await screen.findByRole("option", { name: "已作废" });
	fireEvent.pointerDown(voided);
	fireEvent.click(voided);

	expect(onStatusChange).toHaveBeenCalledWith("voided");
});
