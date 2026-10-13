import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "@/components/layout/page-header";

describe("PageHeader", () => {
	it("显示大标题，是页面唯一的一级标题", () => {
		render(<PageHeader title="测试任务" />);

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
			"测试任务"
		);
	});

	it("有数据概要时，在标题下显示概要", () => {
		render(<PageHeader summary="3 个测试任务在测试中" title="测试任务" />);

		expect(screen.getByText("3 个测试任务在测试中")).toBeTruthy();
	});

	it("没有数据概要时，不显示概要的段落", () => {
		const { container } = render(<PageHeader title="测试任务" />);

		expect(container.querySelector("p")).toBeNull();
	});

	it("显示右侧的操作按钮", () => {
		render(
			<PageHeader
				actions={<button type="button">新建测试任务</button>}
				title="测试任务"
			/>
		);

		expect(screen.getByRole("button", { name: "新建测试任务" })).toBeTruthy();
	});

	it("在标题旁边显示状态标签", () => {
		render(<PageHeader badge={<span>测试中</span>} title="冒烟测试" />);

		expect(screen.getByText("测试中")).toBeTruthy();
	});
});
