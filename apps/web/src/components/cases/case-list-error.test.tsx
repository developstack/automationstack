import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaseListError } from "@/components/cases/case-list-error";

function renderError(isFetching: boolean, title?: string) {
	const refetch = vi.fn(() => Promise.resolve());
	render(
		<CaseListError
			query={{ error: new Error("数据库连接超时"), isFetching, refetch }}
			title={title}
		/>
	);
	return refetch;
}

describe("CaseListError：用例列表加载失败时可以重试", () => {
	it("显示服务端给出的原因，点击重试后重新加载", () => {
		const refetch = renderError(false);
		expect(screen.getByRole("alert").textContent).toContain("数据库连接超时");
		fireEvent.click(screen.getByRole("button", { name: "重试" }));
		expect(refetch).toHaveBeenCalledOnce();
	});

	it("重新加载时重试按钮显示加载状态，不能重复点击", () => {
		const refetch = renderError(true);
		const retry = screen.getByRole("button", { name: "重试" });
		expect(retry.getAttribute("aria-busy")).toBe("true");
		fireEvent.click(retry);
		expect(refetch).not.toHaveBeenCalled();
	});

	it("其他位置可以换标题，例如用例详情加载失败", () => {
		renderError(false, "用例详情加载失败");
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("用例详情加载失败");
		expect(alert.textContent).not.toContain("用例列表加载失败");
	});
});
