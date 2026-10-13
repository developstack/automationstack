import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { ModuleNameInput } from "@/components/workspace/module-name-input";

interface ViewOptions {
	defaultValue?: string;
	error?: string | null;
	pending?: boolean;
}

function renderInput(options: ViewOptions = {}) {
	const handlers = {
		onCancel: vi.fn(),
		onEdit: vi.fn(),
		onOuterKeyDown: vi.fn(),
		onSubmit: vi.fn(),
	};
	render(
		<ModuleNameInput
			defaultValue={options.defaultValue ?? ""}
			error={options.error ?? null}
			label="模块名称"
			onCancel={handlers.onCancel}
			onEdit={handlers.onEdit}
			onSubmit={handlers.onSubmit}
			pending={options.pending ?? false}
		/>
	);
	// 抽屉和对话框在 document 上监听 Esc，所以在这里检查按键有没有冒泡出去
	document.addEventListener("keydown", handlers.onOuterKeyDown);
	onTestFinished(() =>
		document.removeEventListener("keydown", handlers.onOuterKeyDown)
	);
	const input = screen.getByRole("textbox", { name: "模块名称" });
	return { handlers, input };
}

function type(input: HTMLElement, value: string) {
	fireEvent.change(input, { target: { value } });
}

describe("ModuleNameInput：在模块树中就地输入模块名称", () => {
	it("出现时获得焦点，重命名时显示原来的名称", () => {
		const { input } = renderInput({ defaultValue: "支付" });
		expect(document.activeElement).toBe(input);
		expect((input as HTMLInputElement).value).toBe("支付");
	});

	it("Enter 保存新名称", () => {
		const { handlers, input } = renderInput();
		type(input, "下单流程");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(handlers.onSubmit).toHaveBeenCalledWith("下单流程", "enter");
	});

	it("Esc 取消并说明是 Esc，按键不冒泡，不会关闭外层的抽屉", () => {
		const { handlers, input } = renderInput();
		type(input, "下单流程");
		fireEvent.keyDown(input, { key: "Escape" });
		expect(handlers.onCancel).toHaveBeenCalledWith("escape");
		expect(handlers.onSubmit).not.toHaveBeenCalled();
		expect(handlers.onOuterKeyDown).not.toHaveBeenCalled();
	});

	it("名称为空时按 Enter，在字段旁边提示原因，不保存", () => {
		const { handlers, input } = renderInput();
		fireEvent.keyDown(input, { key: "Enter" });
		expect(handlers.onSubmit).not.toHaveBeenCalled();
		expect(input.getAttribute("aria-invalid")).toBe("true");
		const message = document.getElementById(
			input.getAttribute("aria-describedby") ?? ""
		);
		expect(message?.textContent).toBe("请输入模块名称");
	});

	it("显示服务端的错误；修改名称后通知外层清除错误", () => {
		const { handlers, input } = renderInput({ error: "模块不存在" });
		expect(screen.getByText("模块不存在")).toBeDefined();
		expect(input.getAttribute("aria-invalid")).toBe("true");
		type(input, "新名称");
		expect(handlers.onEdit).toHaveBeenCalled();
	});

	it("保存中：输入框只读并标记忙碌，Enter 和失去焦点都不再提交", () => {
		const { handlers, input } = renderInput({
			defaultValue: "支付",
			pending: true,
		});
		expect(input.hasAttribute("readonly")).toBe(true);
		expect(input.getAttribute("aria-busy")).toBe("true");
		fireEvent.keyDown(input, { key: "Enter" });
		fireEvent.blur(input);
		expect(handlers.onSubmit).not.toHaveBeenCalled();
		expect(handlers.onCancel).not.toHaveBeenCalled();
	});

	it("失去焦点：有新名称时保存，并说明是失去焦点", () => {
		const first = renderInput();
		type(first.input, "退款");
		fireEvent.blur(first.input);
		expect(first.handlers.onSubmit).toHaveBeenCalledWith("退款", "blur");
	});

	it("失去焦点且名称为空时取消，并说明是失去焦点（外层不移动焦点）", () => {
		const { handlers, input } = renderInput();
		fireEvent.blur(input);
		expect(handlers.onCancel).toHaveBeenCalledWith("blur");
	});

	it("保存失败、错误还显示时失去焦点：不再提交，也不取消，输入框和原因留在原处", () => {
		const { handlers, input } = renderInput({ error: "模块不存在" });
		type(input, "退款");
		fireEvent.blur(input);
		expect(handlers.onSubmit).not.toHaveBeenCalled();
		expect(handlers.onCancel).not.toHaveBeenCalled();
	});

	it("保存中显示加载图标，看得出正在保存", () => {
		renderInput({ defaultValue: "支付", pending: true });
		expect(screen.getByTestId("module-name-saving")).toBeDefined();
	});
});
