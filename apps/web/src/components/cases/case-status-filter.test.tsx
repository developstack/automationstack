import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaseStatusFilter } from "@/components/cases/case-status-filter";
import { PriorityFilter } from "@/components/cases/priority-filter";

describe("CaseStatusFilter：按用例状态筛选", () => {
	it("没有筛选时「全部」是按下的", () => {
		render(<CaseStatusFilter onChange={vi.fn()} status={undefined} />);
		expect(
			screen.getByRole("button", { name: "全部" }).getAttribute("aria-pressed")
		).toBe("true");
	});

	it("点击一个状态，只按这个状态筛选", () => {
		const onChange = vi.fn();
		render(<CaseStatusFilter onChange={onChange} status={undefined} />);
		fireEvent.click(screen.getByRole("button", { name: "草稿" }));
		expect(onChange).toHaveBeenCalledWith("draft");
	});

	it("点击「全部」或再次点击已按下的状态，取消状态筛选", () => {
		const onChange = vi.fn();
		render(<CaseStatusFilter onChange={onChange} status="active" />);
		fireEvent.click(screen.getByRole("button", { name: "生效" }));
		fireEvent.click(screen.getByRole("button", { name: "全部" }));
		expect(onChange.mock.calls).toEqual([[undefined], [undefined]]);
	});
});

describe("PriorityFilter：按优先级筛选，可以选多个", () => {
	it("按下一个优先级后加入筛选，再按一次移出", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<PriorityFilter onChange={onChange} priority={["P0"]} />
		);
		fireEvent.click(screen.getByRole("button", { name: "P2" }));
		expect(onChange).toHaveBeenLastCalledWith(["P0", "P2"]);
		rerender(<PriorityFilter onChange={onChange} priority={["P0", "P2"]} />);
		fireEvent.click(screen.getByRole("button", { name: "P0" }));
		expect(onChange).toHaveBeenLastCalledWith(["P2"]);
	});

	it.each([
		{ dot: "bg-destructive", priority: "P0", tone: "priority-p0" },
		{ dot: "bg-warning", priority: "P1", tone: "priority-p1" },
		{ dot: "bg-info", priority: "P2", tone: "priority-p2" },
		{ dot: "bg-muted-foreground", priority: "P3", tone: "priority-p3" },
	] as const)(
		"$priority 按下时显示 $tone 的统一状态标签，没有按下时显示 $dot 的色点",
		({ dot, priority, tone }) => {
			const { rerender } = render(
				<PriorityFilter onChange={vi.fn()} priority={[]} />
			);
			const button = screen.getByRole("button", { name: priority });
			expect(button.querySelector("[data-tone]")).toBeNull();
			const dotElement = button.querySelector("[data-priority-dot]");
			expect(dotElement?.className.split(" ")).toContain(dot);
			expect(dotElement?.getAttribute("aria-hidden")).toBe("true");

			rerender(<PriorityFilter onChange={vi.fn()} priority={[priority]} />);
			const pressed = screen.getByRole("button", { name: priority });
			expect(pressed.getAttribute("aria-pressed")).toBe("true");
			expect(
				pressed.querySelector("[data-tone]")?.getAttribute("data-tone")
			).toBe(tone);
			expect(
				pressed.querySelector("[data-priority-dot]")?.className.split(" ")
			).toContain("bg-current");
		}
	);
});
