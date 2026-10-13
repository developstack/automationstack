import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaseDraftNotice } from "@/components/cases/case-draft-notice";

const RESTORED_AT = new Date(2026, 9, 13, 9, 30).getTime();

describe("CaseDraftNotice：新建面板的草稿提示", () => {
	it("恢复了草稿时说明保存时间，可以放弃草稿", () => {
		const onDiscard = vi.fn();
		render(
			<CaseDraftNotice
				missing={false}
				onDiscard={onDiscard}
				restoredAt={RESTORED_AT}
			/>
		);
		const notice = screen.getByRole("status");
		expect(notice.textContent).toContain("已恢复");
		expect(notice.textContent).toContain("09:30");
		fireEvent.click(screen.getByRole("button", { name: "放弃草稿" }));
		expect(onDiscard).toHaveBeenCalledOnce();
	});

	it("要继续编辑的草稿不在这台电脑上时，说明表单是空白的", () => {
		render(
			<CaseDraftNotice missing={true} onDiscard={vi.fn()} restoredAt={null} />
		);
		expect(screen.getByRole("alert").textContent).toContain("空白");
	});

	it("没有草稿时不显示", () => {
		const { container } = render(
			<CaseDraftNotice missing={false} onDiscard={vi.fn()} restoredAt={null} />
		);
		expect(container.textContent).toBe("");
	});
});
