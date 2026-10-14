import type { UseQueryResult } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OverviewQuery } from "@/components/overview/overview-query";

function fakeQuery(
	state: Partial<UseQueryResult<string>>
): UseQueryResult<string> {
	const base = {
		data: undefined,
		error: null,
		isError: false,
		isFetching: false,
		refetch: vi.fn().mockResolvedValue(undefined),
	};
	return { ...base, ...state } as unknown as UseQueryResult<string>;
}

function renderRegion(query: UseQueryResult<string>) {
	return render(
		<OverviewQuery query={query} skeleton={<div>骨架屏</div>} title="用例状态">
			{(data) => <p>{data}</p>}
		</OverviewQuery>
	);
}

describe("OverviewQuery", () => {
	it.each([
		["有数据时显示数据", fakeQuery({ data: "1,284 条用例" }), "1,284 条用例"],
		["没有数据也没有出错时显示骨架屏", fakeQuery({}), "骨架屏"],
		[
			"重新请求的数据失败但已有旧数据时，继续显示旧数据",
			fakeQuery({ data: "旧数据", error: new Error("失败"), isError: true }),
			"旧数据",
		],
	])("%s", (_name, query, text) => {
		renderRegion(query);

		expect(screen.getByText(text)).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("加载失败时在区域内显示原因和重试按钮，点击重试重新请求", () => {
		const query = fakeQuery({
			error: new Error("数据库连接超时"),
			isError: true,
		});
		renderRegion(query);

		expect(screen.getByRole("heading", { name: "用例状态" })).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toContain("数据库连接超时");
		fireEvent.click(screen.getByRole("button", { name: "重试" }));
		expect(query.refetch).toHaveBeenCalledTimes(1);
	});
});
