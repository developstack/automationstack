import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StepsEditor } from "@/components/cases/steps-editor";

const EMPTY_HINT = /还没有步骤/;

const STEPS: CaseStep[] = [
	{ expected: "显示登录页", id: "s1", step: "打开首页" },
	{ expected: "进入工作台", id: "s2", step: "输入账号密码" },
	{ expected: "回到登录页", id: "s3", step: "退出登录" },
];

function renderEditor(steps: CaseStep[]) {
	const onChange = vi.fn<(steps: CaseStep[]) => void>();
	render(<StepsEditor onChange={onChange} steps={steps} />);
	return onChange;
}

function stepIds(onChange: ReturnType<typeof renderEditor>): string[] {
	const [next] = onChange.mock.lastCall ?? [];
	return (next ?? []).map((step) => step.id);
}

describe("StepsEditor：步骤编辑器", () => {
	it("每一步显示编号、操作步骤和预期结果", () => {
		renderEditor(STEPS);
		const rows = screen.getAllByRole("listitem");
		expect(rows).toHaveLength(3);
		expect(rows[1]?.textContent).toContain("2");
		expect(screen.getByLabelText("第 2 步操作")).toBeTruthy();
		expect(screen.getByLabelText("第 2 步预期结果")).toBeTruthy();
	});

	it("没有步骤时给出下一步的指引，点击「新增步骤」添加第 1 步", () => {
		const onChange = renderEditor([]);
		expect(screen.getByText(EMPTY_HINT).textContent).toContain(
			"点击「新增步骤」"
		);
		fireEvent.click(screen.getByRole("button", { name: "新增步骤" }));
		expect(onChange.mock.lastCall?.[0]).toHaveLength(1);
	});

	it("上移、下移和删除按钮按原来的方式工作", () => {
		const onChange = renderEditor(STEPS);
		fireEvent.click(screen.getByRole("button", { name: "第 2 步上移" }));
		expect(stepIds(onChange)).toEqual(["s2", "s1", "s3"]);

		fireEvent.click(screen.getByRole("button", { name: "第 2 步下移" }));
		expect(stepIds(onChange)).toEqual(["s1", "s3", "s2"]);

		fireEvent.click(screen.getByRole("button", { name: "删除第 2 步" }));
		expect(stepIds(onChange)).toEqual(["s1", "s3"]);
	});

	it("每一步有拖动排序的把手，键盘用户使用上移和下移按钮", () => {
		renderEditor(STEPS);
		const handle = screen.getByTitle("拖动第 2 步排序");
		expect(handle.getAttribute("aria-hidden")).toBe("true");
		expect(handle.tabIndex).toBe(-1);
	});
});
