import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { TestRunListToolbar } from "@/components/test-runs/test-run-list-toolbar";

it("状态筛选有「已作废」，选中后只按已作废筛选", async () => {
	const onStatusChange = vi.fn();
	render(
		<TestRunListToolbar
			count={0}
			loaded
			onKeywordChange={vi.fn()}
			onStatusChange={onStatusChange}
			search={{}}
		/>
	);

	fireEvent.click(screen.getByRole("combobox", { name: "按状态筛选测试任务" }));
	// Base UI 只接受从选项上按下的鼠标点击，所以先按下再点击
	const voided = await screen.findByRole("option", { name: "已作废" });
	fireEvent.pointerDown(voided);
	fireEvent.click(voided);

	expect(onStatusChange).toHaveBeenCalledWith("voided");
});
