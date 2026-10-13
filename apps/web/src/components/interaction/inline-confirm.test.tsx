import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InlineConfirm } from "@/components/interaction/inline-confirm";

const PROMPT = "删除这条用例？";

function view(props: { onConfirm: () => void; pending: boolean }) {
	return (
		<div>
			<InlineConfirm
				confirmLabel="确认删除"
				onConfirm={props.onConfirm}
				pending={props.pending}
				prompt={PROMPT}
				triggerLabel="删除"
			/>
			<button type="button">外部按钮</button>
		</div>
	);
}

function renderConfirm(props: { onConfirm?: () => void; pending?: boolean }) {
	const onConfirm = props.onConfirm ?? vi.fn();
	const result = render(view({ onConfirm, pending: props.pending ?? false }));
	return { ...result, onConfirm };
}

function openConfirm() {
	fireEvent.click(screen.getByRole("button", { name: "删除" }));
}

describe("InlineConfirm：在按钮旁边二次确认", () => {
	it("初始只显示触发按钮，不显示确认", () => {
		renderConfirm({});
		expect(screen.getByRole("button", { name: "删除" })).toBeDefined();
		expect(screen.queryByText(PROMPT)).toBeNull();
		expect(screen.queryByRole("button", { name: "确认删除" })).toBeNull();
	});

	it("点击触发按钮后，在原位显示提示、确认和取消，不弹出对话框", () => {
		renderConfirm({});
		openConfirm();
		expect(screen.getByText(PROMPT)).toBeDefined();
		expect(screen.getByRole("button", { name: "确认删除" })).toBeDefined();
		expect(screen.getByRole("button", { name: "取消" })).toBeDefined();
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	it("进入确认后，焦点在「取消」上，连按 Enter 不会直接删除", () => {
		renderConfirm({});
		openConfirm();
		const cancel = screen.getByRole("button", { name: "取消" });
		expect(document.activeElement).toBe(cancel);
		expect(screen.getByText(PROMPT).id).toBe(
			cancel.getAttribute("aria-describedby")
		);
	});

	it("点击确认后调用 onConfirm 一次", () => {
		const { onConfirm } = renderConfirm({});
		openConfirm();
		fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("点击取消后回到触发按钮，焦点回到触发按钮，不调用 onConfirm", () => {
		const { onConfirm } = renderConfirm({});
		openConfirm();
		fireEvent.click(screen.getByRole("button", { name: "取消" }));
		const trigger = screen.getByRole("button", { name: "删除" });
		expect(screen.queryByText(PROMPT)).toBeNull();
		expect(document.activeElement).toBe(trigger);
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("按 Esc 取消确认", () => {
		const { onConfirm } = renderConfirm({});
		openConfirm();
		fireEvent.keyDown(screen.getByRole("button", { name: "取消" }), {
			key: "Escape",
		});
		expect(screen.queryByText(PROMPT)).toBeNull();
		expect(screen.getByRole("button", { name: "删除" })).toBeDefined();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("焦点移出确认区域时取消确认", () => {
		renderConfirm({});
		openConfirm();
		fireEvent.blur(screen.getByRole("button", { name: "取消" }), {
			relatedTarget: screen.getByRole("button", { name: "外部按钮" }),
		});
		expect(screen.queryByText(PROMPT)).toBeNull();
	});

	it("失焦但没有新的焦点元素时（Safari 点击按钮）保持确认", () => {
		renderConfirm({});
		openConfirm();
		fireEvent.blur(screen.getByRole("button", { name: "取消" }), {
			relatedTarget: null,
		});
		expect(screen.getByText(PROMPT)).toBeDefined();
	});

	it("焦点在确认区域内移动时保持确认", () => {
		renderConfirm({});
		openConfirm();
		fireEvent.blur(screen.getByRole("button", { name: "取消" }), {
			relatedTarget: screen.getByRole("button", { name: "确认删除" }),
		});
		expect(screen.getByText(PROMPT)).toBeDefined();
	});

	it("提交中：确认按钮显示加载状态，不能再次点击，Esc 不取消", () => {
		const { onConfirm, rerender } = renderConfirm({});
		openConfirm();
		rerender(view({ onConfirm, pending: true }));
		const confirm = screen.getByRole("button", { name: "确认删除" });
		expect(confirm.getAttribute("aria-busy")).toBe("true");
		expect(confirm.getAttribute("aria-disabled")).toBe("true");
		fireEvent.click(confirm);
		expect(onConfirm).not.toHaveBeenCalled();
		fireEvent.keyDown(confirm, { key: "Escape" });
		expect(screen.getByText(PROMPT)).toBeDefined();
		const cancel = screen.getByRole("button", { name: "取消" });
		expect(cancel.getAttribute("aria-disabled")).toBe("true");
		expect(cancel.hasAttribute("disabled")).toBe(false);
	});

	it("确认中按 Esc 不会传到外层（例如关闭所在的抽屉），提交中也一样", () => {
		const outerEscape = vi.fn();
		document.addEventListener("keydown", outerEscape);
		try {
			const { onConfirm, rerender } = renderConfirm({});
			openConfirm();
			rerender(view({ onConfirm, pending: true }));
			fireEvent.keyDown(screen.getByRole("button", { name: "确认删除" }), {
				key: "Escape",
			});
			fireEvent.keyDown(screen.getByRole("button", { name: "取消" }), {
				key: "Escape",
			});
			expect(outerEscape).not.toHaveBeenCalled();
			expect(screen.getByText(PROMPT)).toBeDefined();
		} finally {
			document.removeEventListener("keydown", outerEscape);
		}
	});
});
