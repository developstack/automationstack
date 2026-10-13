import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaseConflictAlert } from "@/components/cases/case-conflict-alert";

function renderAlert(overrides: { latestVersion?: number; saving?: boolean }) {
	const handlers = {
		onDiscard: vi.fn(),
		onDismiss: vi.fn(),
		onOverwrite: vi.fn(),
		onViewHistory: vi.fn(),
	};
	render(
		<CaseConflictAlert
			conflict={{ currentVersion: 5, lastModifiedBy: "李四" }}
			latestVersion={overrides.latestVersion ?? 5}
			saving={overrides.saving ?? false}
			{...handlers}
		/>
	);
	return handlers;
}

describe("CaseConflictAlert：其他人先保存时，提示说明下一步", () => {
	it("说明谁先保存了哪个版本，以及表单里的修改没有丢失", () => {
		renderAlert({});
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("李四");
		expect(alert.textContent).toContain("v5");
		expect(alert.textContent).toContain("你的修改还在表单中");
	});

	it("三个下一步各自对应一个按钮", () => {
		const handlers = renderAlert({});
		fireEvent.click(screen.getByRole("button", { name: "查看对方的修改" }));
		fireEvent.click(screen.getByRole("button", { name: "放弃我的修改" }));
		fireEvent.click(screen.getByRole("button", { name: "用我的修改覆盖" }));
		expect(handlers.onViewHistory).toHaveBeenCalledOnce();
		expect(handlers.onDiscard).toHaveBeenCalledOnce();
		expect(handlers.onOverwrite).toHaveBeenCalledOnce();
	});

	it("最新版本还没有载入时不能覆盖，否则会再次冲突", () => {
		const handlers = renderAlert({ latestVersion: 4 });
		const overwrite = screen.getByRole("button", { name: "用我的修改覆盖" });
		expect(overwrite.getAttribute("aria-busy")).toBe("true");
		fireEvent.click(overwrite);
		expect(handlers.onOverwrite).not.toHaveBeenCalled();
	});

	it("保存中不能重复覆盖", () => {
		const handlers = renderAlert({ saving: true });
		fireEvent.click(screen.getByRole("button", { name: "用我的修改覆盖" }));
		expect(handlers.onOverwrite).not.toHaveBeenCalled();
	});

	it("可以关闭提示", () => {
		const handlers = renderAlert({});
		fireEvent.click(screen.getByRole("button", { name: "关闭冲突提示" }));
		expect(handlers.onDismiss).toHaveBeenCalledOnce();
	});
});
