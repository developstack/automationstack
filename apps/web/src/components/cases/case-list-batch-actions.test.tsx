import { MAX_BATCH_CASES } from "@automationstack/api/schemas/case";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaseListBatchActions } from "@/components/cases/case-list-batch-actions";
import type { CaseSelection } from "@/components/cases/use-case-selection";

const api = vi.hoisted(() => ({
	changeStatus: vi.fn<(input: unknown) => Promise<unknown>>(),
	removeMany: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
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
			removeMany: {
				mutationOptions: (options: object) => ({
					...options,
					mutationFn: api.removeMany,
				}),
			},
		},
		mindmap: { key: () => ["mindmap"] },
	},
}));

function caseIds(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `case-${index}`);
}

/** 最近一次渲染使用的 QueryClient，用来检查操作后重新载入了哪些查询。 */
let queryClient = new QueryClient();

function renderActions(ids: string[]) {
	queryClient = new QueryClient();
	const selection: CaseSelection = {
		clear: vi.fn(),
		ids: new Set(ids),
		toggle: vi.fn(),
		togglePage: vi.fn(),
	};
	render(
		<QueryClientProvider client={queryClient}>
			<CaseListBatchActions selection={selection} />
		</QueryClientProvider>
	);
	return selection;
}

const statusButton = () => screen.queryByRole("button", { name: "改状态" });
const deleteButton = () => screen.queryByRole("button", { name: "删除" });

/** 点「删除」，在确认弹窗中再点「删除」。 */
async function confirmDelete() {
	fireEvent.click(screen.getByRole("button", { name: "删除" }));
	const dialog = await screen.findByRole("alertdialog");
	fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));
}

const caseRef = (id: string) => ({ id, name: `用例 ${id}` });

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
		[`勾选 ${MAX_BATCH_CASES} 条：可以改状态和删除`, MAX_BATCH_CASES, true],
		[
			`勾选超过 ${MAX_BATCH_CASES} 条：不显示「改状态」和「删除」，提示一次最多 ${MAX_BATCH_CASES} 条`,
			MAX_BATCH_CASES + 1,
			false,
		],
	])("%s", (_name, count, allowed) => {
		renderActions(caseIds(count));
		expect(statusButton() !== null).toBe(allowed);
		expect(deleteButton() !== null).toBe(allowed);
		expect(
			screen.queryByText(
				`一次最多处理 ${MAX_BATCH_CASES} 条用例，请减少勾选`
			) !== null
		).toBe(!allowed);
	});
});

describe("CaseListBatchActions：批量删除，被测试任务用到的用例跳过", () => {
	it("点「删除」先弹窗确认已选条数，说明不可恢复；点「取消」不删除", async () => {
		renderActions(caseIds(3));
		fireEvent.click(screen.getByRole("button", { name: "删除" }));
		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("删除 3 条用例？");
		expect(dialog.textContent).toContain("删除后用例和版本历史不可恢复");
		fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		expect(api.removeMany).not.toHaveBeenCalled();
	});

	interface RemoveRow {
		deleted: string[];
		level: "success" | "warning";
		message: string;
		missingIds?: string[];
		name: string;
		skipped?: string[];
	}

	it.each<RemoveRow>([
		{
			deleted: ["case-0", "case-1"],
			level: "success",
			message: "已删除 2 条用例",
			name: "全部删除",
		},
		{
			deleted: ["case-0"],
			level: "warning",
			message: "已删除 1 条，1 条被测试任务用到，已跳过，可改为废弃",
			name: "部分被跳过",
			skipped: ["case-1"],
		},
		{
			deleted: [],
			level: "warning",
			message: "已删除 0 条，2 条被测试任务用到，已跳过，可改为废弃",
			name: "全部被跳过",
			skipped: ["case-0", "case-1"],
		},
		{
			deleted: ["case-0"],
			level: "success",
			message: "已删除 1 条用例，另有 1 条已不存在",
			missingIds: ["case-1"],
			name: "有的用例已经被别人删除",
		},
	])(
		"$name：一个请求删除所有勾选的用例，提示结果，清空勾选，重新载入列表",
		async ({ deleted, level, message, missingIds = [], skipped = [] }) => {
			api.removeMany.mockResolvedValue({
				deleted: deleted.map(caseRef),
				missingIds,
				skipped: skipped.map((id) => ({
					...caseRef(id),
					referencedByRunCount: 1,
				})),
			});
			const selection = renderActions(caseIds(2));
			const invalidate = vi.spyOn(queryClient, "invalidateQueries");
			await confirmDelete();
			await waitFor(() => expect(selection.clear).toHaveBeenCalled());
			// 用例列表（含条数）和脑图重新载入
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cases"] });
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ["mindmap"] });
			expect(api.removeMany).toHaveBeenCalledTimes(1);
			expect(api.removeMany.mock.calls[0]?.[0]).toEqual({ ids: caseIds(2) });
			expect(toast[level]).toHaveBeenCalledWith(message);
		}
	);

	it("请求还没有完成：不显示「改状态」和「删除」，不能发第二个请求", async () => {
		api.removeMany.mockReturnValue(new Promise(() => undefined));
		renderActions(caseIds(2));
		await confirmDelete();
		expect(await screen.findByText("正在删除…")).not.toBeNull();
		expect(statusButton()).toBeNull();
		expect(deleteButton()).toBeNull();
	});

	it("删除失败：保留勾选，可以再删", async () => {
		api.removeMany.mockRejectedValue(new Error("断网"));
		const selection = renderActions(caseIds(2));
		await confirmDelete();
		await waitFor(() => expect(deleteButton()).not.toBeNull());
		expect(selection.clear).not.toHaveBeenCalled();
	});
});
