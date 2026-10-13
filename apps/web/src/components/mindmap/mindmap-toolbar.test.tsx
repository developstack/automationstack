import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	MindmapToolbar,
	type MindmapToolbarViewport,
} from "./mindmap-toolbar.tsx";

type ScaleListener = (scale: number) => void;

function fakeViewport(scaleVal = 1) {
	const listeners = new Set<ScaleListener>();
	const viewport = {
		bus: {
			addListener: (_event: "scale", listener: ScaleListener) => {
				listeners.add(listener);
			},
			removeListener: (_event: "scale", listener: ScaleListener) => {
				listeners.delete(listener);
			},
		},
		scale: vi.fn((next: number) => {
			viewport.scaleVal = next;
			for (const listener of listeners) {
				listener(next);
			}
		}),
		scaleMax: 1.4,
		scaleMin: 0.2,
		scaleSensitivity: 0.1,
		scaleVal,
		toCenter: vi.fn(),
	} satisfies MindmapToolbarViewport;
	return viewport;
}

/** 不能点击的按钮仍然可以获得焦点（aria-disabled），否则工具栏会从 Tab 顺序中消失。 */
function isInert(button: HTMLElement): boolean {
	return (
		button.hasAttribute("disabled") ||
		button.getAttribute("aria-disabled") === "true"
	);
}

const NOT_FULLSCREEN = { active: false, toggle: vi.fn() };

describe("MindmapToolbar：缩放、回到中心和全屏", () => {
	it("显示当前缩放比例，点击放大和缩小按步长缩放", () => {
		const viewport = fakeViewport();
		render(<MindmapToolbar fullscreen={NOT_FULLSCREEN} viewport={viewport} />);
		expect(
			screen.getByRole("toolbar", { name: "脑图视图" }).textContent
		).toContain("100%");

		fireEvent.click(screen.getByRole("button", { name: "放大" }));
		expect(viewport.scale).toHaveBeenLastCalledWith(1.1);
		expect(screen.getByRole("toolbar").textContent).toContain("110%");

		fireEvent.click(screen.getByRole("button", { name: "缩小" }));
		expect(viewport.scale).toHaveBeenLastCalledWith(1);
	});

	it("滚轮缩放后比例也会更新", () => {
		const viewport = fakeViewport();
		render(<MindmapToolbar fullscreen={NOT_FULLSCREEN} viewport={viewport} />);
		act(() => viewport.scale(0.5));
		expect(screen.getByRole("toolbar").textContent).toContain("50%");
	});

	it("到达最大或最小比例时，对应的按钮不能点击", () => {
		const { rerender } = render(
			<MindmapToolbar
				fullscreen={NOT_FULLSCREEN}
				viewport={fakeViewport(1.4)}
			/>
		);
		expect(isInert(screen.getByRole("button", { name: "放大" }))).toBe(true);
		expect(isInert(screen.getByRole("button", { name: "缩小" }))).toBe(false);

		rerender(
			<MindmapToolbar
				fullscreen={NOT_FULLSCREEN}
				viewport={fakeViewport(0.2)}
			/>
		);
		expect(isInert(screen.getByRole("button", { name: "缩小" }))).toBe(true);
	});

	it("回到中心和全屏调用对应的操作，全屏时按钮改为退出全屏", () => {
		const viewport = fakeViewport();
		const toggle = vi.fn();
		const { rerender } = render(
			<MindmapToolbar
				fullscreen={{ active: false, toggle }}
				viewport={viewport}
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: "回到中心" }));
		expect(viewport.toCenter).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByRole("button", { name: "全屏" }));
		expect(toggle).toHaveBeenCalledOnce();

		rerender(
			<MindmapToolbar
				fullscreen={{ active: true, toggle }}
				viewport={viewport}
			/>
		);
		expect(screen.getByRole("button", { name: "退出全屏" })).toBeTruthy();
	});

	it("只有一个按钮在 Tab 顺序中，左右方向键在按钮之间循环移动焦点", async () => {
		render(
			<MindmapToolbar fullscreen={NOT_FULLSCREEN} viewport={fakeViewport()} />
		);
		const buttons = screen.getAllByRole("button");
		expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1, -1]);
		buttons[0]?.focus();
		fireEvent.keyDown(buttons[0] as HTMLElement, { key: "ArrowLeft" });
		await waitFor(() => expect(document.activeElement).toBe(buttons[3]));
		fireEvent.keyDown(buttons[3] as HTMLElement, { key: "ArrowRight" });
		await waitFor(() => expect(document.activeElement).toBe(buttons[0]));
	});

	it("每个按钮都有悬停提示", () => {
		render(
			<MindmapToolbar fullscreen={NOT_FULLSCREEN} viewport={fakeViewport()} />
		);
		for (const button of screen.getAllByRole("button")) {
			expect(button.getAttribute("title")).toBe(
				button.getAttribute("aria-label")
			);
		}
	});
});
