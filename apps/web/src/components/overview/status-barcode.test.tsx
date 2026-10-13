import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBarcode } from "@/components/overview/status-barcode";

describe("StatusBarcode", () => {
	it("用例少时一条竖线表示一条用例，并显示每种状态的图例", () => {
		const { container } = render(
			<StatusBarcode counts={{ active: 3, deprecated: 1, draft: 2 }} />
		);

		expect(screen.getByText("每条竖线表示 1 条用例")).toBeTruthy();
		expect(container.querySelectorAll("[data-barcode-mark]")).toHaveLength(6);
		for (const label of ["生效", "草稿", "废弃"]) {
			expect(screen.getByText(label)).toBeTruthy();
		}
	});

	it("用例多时一条竖线表示多条用例，不能整除时说明是约数", () => {
		render(
			<StatusBarcode counts={{ active: 1000, deprecated: 84, draft: 200 }} />
		);

		expect(screen.getByText("每条竖线约表示 11 条用例")).toBeTruthy();
	});
});
