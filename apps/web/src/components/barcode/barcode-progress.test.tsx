import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarcodeProgress } from "@/components/barcode/barcode-progress";

function marksOf(container: HTMLElement): HTMLElement[] {
	return [...container.querySelectorAll<HTMLElement>("[data-barcode-mark]")];
}

describe("BarcodeProgress", () => {
	it("数量不超过竖线上限时，一条竖线表示一个数量，按分段的顺序和填充色排列", () => {
		const { container } = render(
			<BarcodeProgress
				segments={[
					{ fillClassName: "bg-result-passed", key: "passed", value: 2 },
					{ fillClassName: "bg-result-failed", key: "failed", value: 1 },
					{ fillClassName: "bg-chart-1", key: "untested", value: 0 },
				]}
			/>
		);

		const fills = marksOf(container).map((mark) =>
			mark.classList.contains("bg-result-passed") ? "passed" : "failed"
		);
		expect(fills).toEqual(["passed", "passed", "failed"]);
	});

	it("数量超过竖线上限时，竖线总数等于上限", () => {
		const { container } = render(
			<BarcodeProgress
				maxMarks={40}
				segments={[
					{ fillClassName: "bg-foreground", key: "share", value: 300 },
					{ fillClassName: "bg-muted", key: "rest", value: 700 },
				]}
			/>
		);

		expect(marksOf(container)).toHaveLength(40);
		expect(
			marksOf(container).filter((mark) =>
				mark.classList.contains("bg-foreground")
			)
		).toHaveLength(12);
	});

	it("竖线是装饰，对屏幕阅读器隐藏；数量由旁边的文字说明", () => {
		const { container } = render(
			<BarcodeProgress
				segments={[{ fillClassName: "bg-foreground", key: "a", value: 3 }]}
			/>
		);

		expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe(
			"true"
		);
	});

	it("没有数量时不画竖线，显示空的轨道", () => {
		const { container } = render(
			<BarcodeProgress
				segments={[{ fillClassName: "bg-foreground", key: "a", value: 0 }]}
			/>
		);

		expect(marksOf(container)).toHaveLength(0);
		expect(container.querySelector("[data-barcode-empty]")).not.toBeNull();
	});
});
