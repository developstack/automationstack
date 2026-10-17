import { MAX_STATUS_CHANGE_CASES } from "@automationstack/api/schemas/case";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaseListBatchActions } from "@/components/cases/case-list-batch-actions";
import type { CaseSelection } from "@/components/cases/use-case-selection";

const api = vi.hoisted(() => ({
	changeStatus: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/utils/orpc", () => ({
	orpc: {
		cases: {
			changeStatus: {
				mutationOptions: (options: object) => ({
					...options,
					mutationFn: api.changeStatus,
				}),
			},
			key: () => ["cases"],
			list: { key: () => ["cases", "list"] },
		},
		mindmap: { key: () => ["mindmap"] },
	},
}));

function caseIds(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `case-${index}`);
}

function renderActions(ids: string[]) {
	const selection: CaseSelection = {
		clear: vi.fn(),
		ids: new Set(ids),
		toggle: vi.fn(),
		togglePage: vi.fn(),
	};
	render(
		<QueryClientProvider client={new QueryClient()}>
			<CaseListBatchActions selection={selection} />
		</QueryClientProvider>
	);
	return selection;
}

const statusButton = () => screen.queryByRole("button", { name: "改状态" });

async function chooseStatus(label: string) {
	fireEvent.click(screen.getByRole("button", { name: "改状态" }));
	fireEvent.click(await screen.findByRole("menuitem", { name: label }));
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("CaseListBatchActions：有勾选时才出现批量操作栏", () => {
	it("没有勾选：不显示批量操作栏", () => {
		renderActions([]);
		expect(screen.queryByRole("region", { name: "批量操作" })).toBeNull();
	});

	it("显示已选条数；「取消选择」清空勾选", () => {
		const selection = renderActions(caseIds(3));
		expect(
			screen.getByRole("region", { name: "批量操作" }).textContent
		).toContain("已选 3 条");
		fireEvent.click(screen.getByRole("button", { name: "取消选择" }));
		expect(selection.clear).toHaveBeenCalled();
	});

	it("改状态：菜单中有草稿、生效、废弃；选中后一次修改所有勾选的用例，成功后清空勾选", async () => {
		api.changeStatus.mockResolvedValue({ changes: [] });
		const selection = renderActions(caseIds(2));
		fireEvent.click(screen.getByRole("button", { name: "改状态" }));
		const items = await screen.findAllByRole("menuitem");
		expect(items.map((item) => item.textContent)).toEqual([
			"草稿",
			"生效",
			"废弃",
		]);
		fireEvent.click(screen.getByRole("menuitem", { name: "生效" }));
		await waitFor(() => expect(selection.clear).toHaveBeenCalled());
		expect(api.changeStatus.mock.calls[0]?.[0]).toEqual({
			ids: caseIds(2),
			status: "active",
		});
	});

	it("请求还没有完成：不显示「改状态」，不能发第二个请求", async () => {
		api.changeStatus.mockReturnValue(new Promise(() => undefined));
		renderActions(caseIds(2));
		await chooseStatus("废弃");
		expect(await screen.findByText("正在修改状态…")).not.toBeNull();
		expect(statusButton()).toBeNull();
	});

	it("保存失败：保留勾选，可以再改", async () => {
		api.changeStatus.mockRejectedValue(new Error("断网"));
		const selection = renderActions(caseIds(2));
		await chooseStatus("废弃");
		await waitFor(() => expect(statusButton()).not.toBeNull());
		expect(api.changeStatus).toHaveBeenCalledTimes(1);
		expect(selection.clear).not.toHaveBeenCalled();
	});

	it.each<[string, number, boolean]>([
		[
			`勾选 ${MAX_STATUS_CHANGE_CASES} 条：可以改状态`,
			MAX_STATUS_CHANGE_CASES,
			true,
		],
		[
			`勾选超过 ${MAX_STATUS_CHANGE_CASES} 条：不显示「改状态」，提示一次最多 ${MAX_STATUS_CHANGE_CASES} 条`,
			MAX_STATUS_CHANGE_CASES + 1,
			false,
		],
	])("%s", (_name, count, canChange) => {
		renderActions(caseIds(count));
		expect(statusButton() !== null).toBe(canChange);
		expect(
			screen.queryByText(
				`一次最多修改 ${MAX_STATUS_CHANGE_CASES} 条用例的状态，请减少勾选`
			) !== null
		).toBe(!canChange);
	});
});
