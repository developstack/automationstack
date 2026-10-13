import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TypeToConfirmDialog } from "@/components/interaction/type-to-confirm-dialog";

const PROJECT_NAME = "支付中心";
const NAME_INPUT_LABEL = /输入项目名称/;
const MISMATCH_ERROR = "输入的名称与项目名称不一致";

interface RenderOptions {
	onClose?: () => void;
	onConfirm?: () => void;
	open?: boolean;
	pending?: boolean;
}

function dialog(options: RenderOptions) {
	return (
		<TypeToConfirmDialog
			confirmLabel="删除项目"
			description="项目下的模块与用例将一并删除，且不可恢复。"
			name={PROJECT_NAME}
			nameLabel="项目名称"
			onClose={options.onClose ?? vi.fn()}
			onConfirm={options.onConfirm ?? vi.fn()}
			open={options.open ?? true}
			pending={options.pending ?? false}
			title={`删除项目「${PROJECT_NAME}」？`}
		/>
	);
}

function renderDialog(options: RenderOptions = {}) {
	const onClose = options.onClose ?? vi.fn();
	const onConfirm = options.onConfirm ?? vi.fn();
	const result = render(dialog({ ...options, onClose, onConfirm }));
	return { ...result, onClose, onConfirm };
}

function nameInput(): HTMLElement {
	return screen.getByLabelText(NAME_INPUT_LABEL);
}

function confirmButton(): HTMLElement {
	return screen.getByRole("button", { name: "删除项目" });
}

function typeName(value: string) {
	fireEvent.change(nameInput(), { target: { value } });
}

describe("TypeToConfirmDialog：输入名称才能确认", () => {
	it("提示要输入的名称", () => {
		renderDialog();
		expect(screen.getByRole("alertdialog")).toBeDefined();
		expect(screen.getAllByText(PROJECT_NAME).length).toBeGreaterThan(0);
	});

	it("名称为空或不一致时，确认按钮不可用，点击不调用 onConfirm", () => {
		const { onConfirm } = renderDialog();
		expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
		typeName("支付");
		expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
		fireEvent.click(confirmButton());
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("输入完全一致的名称后，点击确认调用 onConfirm", () => {
		const { onConfirm } = renderDialog();
		typeName(PROJECT_NAME);
		expect(confirmButton().getAttribute("aria-disabled")).not.toBe("true");
		fireEvent.click(confirmButton());
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("要输入的名称为空时，空输入也不能确认", () => {
		const onConfirm = vi.fn();
		render(
			<TypeToConfirmDialog
				confirmLabel="删除项目"
				description="说明"
				name=""
				nameLabel="项目名称"
				onClose={vi.fn()}
				onConfirm={onConfirm}
				open={true}
				pending={false}
				title="删除项目？"
			/>
		);
		fireEvent.submit(nameInput());
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("忽略名称前后的空格", () => {
		const { onConfirm } = renderDialog();
		typeName(`  ${PROJECT_NAME} `);
		fireEvent.click(confirmButton());
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("名称一致时，在输入框按 Enter 提交", () => {
		const { onConfirm } = renderDialog();
		typeName(PROJECT_NAME);
		fireEvent.submit(nameInput());
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("名称不一致时按 Enter，不提交，并在输入框旁边显示错误", () => {
		const { onConfirm } = renderDialog();
		typeName("支付");
		fireEvent.keyDown(nameInput(), { key: "Enter" });
		fireEvent.submit(nameInput());
		expect(onConfirm).not.toHaveBeenCalled();
		const error = screen.getByText(MISMATCH_ERROR);
		expect(nameInput().getAttribute("aria-invalid")).toBe("true");
		expect(nameInput().getAttribute("aria-describedby")).toContain(error.id);
	});

	it("修改输入后清除错误", () => {
		renderDialog();
		typeName("支付");
		fireEvent.keyDown(nameInput(), { key: "Enter" });
		typeName("支付中");
		expect(screen.queryByText(MISMATCH_ERROR)).toBeNull();
	});

	it("按 Esc 关闭对话框", () => {
		const { onClose } = renderDialog();
		fireEvent.keyDown(nameInput(), { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("提交中：确认按钮显示加载状态并不能再次点击，取消不可用，Esc 不关闭", () => {
		const { onClose, onConfirm, rerender } = renderDialog();
		typeName(PROJECT_NAME);
		rerender(dialog({ onClose, onConfirm, pending: true }));
		expect(confirmButton().getAttribute("aria-busy")).toBe("true");
		fireEvent.click(confirmButton());
		fireEvent.submit(nameInput());
		expect(onConfirm).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: "取消" }).hasAttribute("disabled")
		).toBe(true);
		fireEvent.keyDown(nameInput(), { key: "Escape" });
		expect(onClose).not.toHaveBeenCalled();
	});

	it("重新打开时清空上次的输入", () => {
		const { onClose, onConfirm, rerender } = renderDialog();
		typeName(PROJECT_NAME);
		rerender(dialog({ onClose, onConfirm, open: false }));
		rerender(dialog({ onClose, onConfirm, open: true }));
		expect(nameInput()).toHaveProperty("value", "");
	});
});
