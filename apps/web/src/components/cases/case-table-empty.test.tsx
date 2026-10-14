import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaseTableEmpty } from "@/components/cases/case-table-empty";

const SELECT_MODULE_HINT = /先在左侧选择一个模块/;

function renderEmpty(props: { canCreate: boolean; filtered: boolean }) {
	const onClearFilters = vi.fn();
	const onCreate = vi.fn();
	render(
		<CaseTableEmpty
			canCreate={props.canCreate}
			filtered={props.filtered}
			onClearFilters={onClearFilters}
			onCreate={onCreate}
		/>
	);
	return { onClearFilters, onCreate };
}

describe("CaseTableEmpty：列表为空和筛选无结果显示不同的指引", () => {
	it("筛选无结果：说明没有匹配的用例，下一步是清除筛选", () => {
		const { onClearFilters, onCreate } = renderEmpty({
			canCreate: true,
			filtered: true,
		});
		expect(screen.getByText("没有匹配的用例")).toBeDefined();
		expect(screen.queryByRole("button", { name: "新建用例" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
		expect(onClearFilters).toHaveBeenCalledOnce();
		expect(onCreate).not.toHaveBeenCalled();
	});

	it("选中的模块下没有用例：下一步是在这里新建用例", () => {
		const { onCreate } = renderEmpty({ canCreate: true, filtered: false });
		expect(screen.getByText("还没有用例")).toBeDefined();
		expect(screen.queryByRole("button", { name: "清除筛选" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "新建用例" }));
		expect(onCreate).toHaveBeenCalledOnce();
	});

	it("没有选择模块：指引先在左侧选择模块，不显示新建按钮", () => {
		renderEmpty({ canCreate: false, filtered: false });
		expect(screen.getByText("还没有用例")).toBeDefined();
		expect(screen.getByText(SELECT_MODULE_HINT)).toBeDefined();
		expect(screen.queryByRole("button", { name: "新建用例" })).toBeNull();
		expect(screen.queryByRole("button", { name: "清除筛选" })).toBeNull();
	});
});
