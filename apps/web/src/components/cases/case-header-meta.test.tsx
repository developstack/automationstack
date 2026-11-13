import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaseHeaderMeta } from "@/components/cases/case-header-meta";
import { hoverTooltipText } from "@/test-dom-fixtures";

const CASE_ID = "3f2a9c1b-7d4e-4f10-9a2b-1c3d5e7f9a0b";

describe("CaseHeaderMeta：面板头部显示用例编号、用例状态和优先级", () => {
	it("编号取用例 ID 的前 8 位，使用等宽字体，悬停时 Tooltip 显示完整的用例 ID", async () => {
		render(<CaseHeaderMeta caseId={CASE_ID} priority="P0" status="active" />);
		const number = screen.getByText("3f2a9c1b");
		expect(number.className).toContain("numeric");
		expect(await hoverTooltipText(number)).toBe(CASE_ID);
	});

	it("用例状态和优先级使用统一状态标签", () => {
		const { container } = render(
			<CaseHeaderMeta caseId={CASE_ID} priority="P1" status="deprecated" />
		);
		expect(
			container.querySelector('[data-status="deprecated"]')?.textContent
		).toBe("废弃");
		expect(container.querySelector('[data-status="P1"]')?.textContent).toBe(
			"P1"
		);
	});
});
