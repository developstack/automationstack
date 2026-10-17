import type { TestCase } from "@automationstack/db/schema/test-cases";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { caseListFilter } from "@/components/cases/case-list-query";
import {
	useCaseBatchStatusChange,
	useCaseStatusChange,
} from "@/components/cases/use-case-status-change";

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

const CASE_ID = "case-login";
const LIST_KEY = ["cases", "list", { page: 1 }];

function renderWithList<T>(
	useHook: () => T,
	items: Pick<TestCase, "id" | "status">[]
) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(LIST_KEY, { items, total: items.length });
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	const view = renderHook(useHook, { wrapper });
	const listedStatuses = () =>
		queryClient
			.getQueryData<{ items: TestCase[] }>(LIST_KEY)
			?.items.map((testCase) => testCase.status);
	return { listedStatuses, view };
}

function renderChange() {
	const { listedStatuses, view } = renderWithList(useCaseStatusChange, [
		{ id: CASE_ID, status: "active" },
	]);
	return { listedStatus: () => listedStatuses()?.[0], view };
}

function successToast(index: number) {
	const call = vi.mocked(toast.success).mock.calls[index];
	return {
		message: call?.[0],
		undo: (call?.[1]?.action as { onClick: () => void } | undefined)?.onClick,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	api.changeStatus.mockResolvedValue({ changes: [] });
});

describe("useCaseStatusChange：改用例状态，提示中可以撤销", () => {
	it("表格中的状态立刻更新，保存后提示「已改为废弃」，带「撤销」", async () => {
		let finish: (value: unknown) => void = () => undefined;
		api.changeStatus.mockReturnValueOnce(
			new Promise((resolve) => {
				finish = resolve;
			})
		);
		const { listedStatus, view } = renderChange();
		let changing: Promise<void> = Promise.resolve();
		act(() => {
			changing = view.result.current({
				caseId: CASE_ID,
				from: "active",
				to: "deprecated",
			});
		});
		await waitFor(() => expect(listedStatus()).toBe("deprecated"));
		expect(api.changeStatus.mock.calls[0]?.[0]).toEqual({
			ids: [CASE_ID],
			status: "deprecated",
		});
		expect(toast.success).not.toHaveBeenCalled();

		await act(async () => {
			finish({ changes: [] });
			await changing;
		});
		expect(toast.success).toHaveBeenCalledWith("已改为废弃", {
			action: { label: "撤销", onClick: expect.any(Function) },
		});
	});

	it("撤销：恢复原来的状态，提示「已恢复为生效」", async () => {
		const { listedStatus, view } = renderChange();
		await act(async () =>
			view.result.current({ caseId: CASE_ID, from: "active", to: "draft" })
		);
		await act(async () => successToast(0).undo?.());
		expect(api.changeStatus.mock.calls[1]?.[0]).toEqual({
			ids: [CASE_ID],
			status: "active",
		});
		expect(listedStatus()).toBe("active");
		expect(successToast(1)).toEqual({
			message: "已恢复为生效",
			undo: undefined,
		});
	});

	it("保存失败：不提示修改成功（失败原因由全局的失败提示显示）", async () => {
		api.changeStatus.mockRejectedValueOnce(new Error("断网"));
		const { view } = renderChange();
		await act(async () =>
			view.result.current({ caseId: CASE_ID, from: "active", to: "draft" })
		);
		expect(toast.success).not.toHaveBeenCalled();
	});
});

const BATCH = [
	{ id: "case-a", status: "draft" },
	{ id: "case-b", status: "active" },
	{ id: "case-c", status: "draft" },
	{ id: "case-d", status: "deprecated" },
] as const;
const BATCH_IDS = BATCH.map((testCase) => testCase.id);

/** 服务端对批量改为 to 的返回：状态没有变化的用例没有新版本。 */
function batchResult(to: string) {
	return {
		changes: BATCH.map(({ id, status }) => ({
			previousStatus: status,
			testCase: { id, status: to },
			version: status === to ? null : { version: 2 },
		})),
	};
}

function renderBatch() {
	return renderWithList(useCaseBatchStatusChange, [...BATCH]);
}

describe("useCaseBatchStatusChange：批量改用例状态，撤销恢复每条用例原来的状态", () => {
	it("一个请求改所有勾选的用例，列表立刻更新；提示结果，带「撤销」", async () => {
		api.changeStatus.mockResolvedValueOnce(batchResult("deprecated"));
		const { listedStatuses, view } = renderBatch();
		let succeeded: boolean | undefined;
		await act(async () => {
			succeeded = await view.result.current({ ids: BATCH_IDS }, "deprecated");
		});
		expect(api.changeStatus.mock.calls).toEqual([
			[{ ids: BATCH_IDS, status: "deprecated" }, expect.anything()],
		]);
		expect(listedStatuses()).toEqual([
			"deprecated",
			"deprecated",
			"deprecated",
			"deprecated",
		]);
		expect(succeeded).toBe(true);
		expect(successToast(0).message).toBe(
			"已将 4 条用例改为废弃，其中 1 条原来就是废弃"
		);
		expect(successToast(0).undo).toEqual(expect.any(Function));
	});

	it("撤销：按原来的状态分组恢复，原来就是目标状态的用例不动", async () => {
		api.changeStatus.mockResolvedValueOnce(batchResult("deprecated"));
		const { listedStatuses, view } = renderBatch();
		await act(async () => {
			await view.result.current({ ids: BATCH_IDS }, "deprecated");
		});
		await act(async () => successToast(0).undo?.());
		expect(
			api.changeStatus.mock.calls.slice(1).map(([input]) => input)
		).toEqual([
			{ ids: ["case-a", "case-c"], status: "draft", undo: true },
			{ ids: ["case-b"], status: "active", undo: true },
		]);
		expect(listedStatuses()).toEqual([
			"draft",
			"active",
			"draft",
			"deprecated",
		]);
		expect(successToast(1)).toEqual({
			message: "已恢复 3 条用例原来的状态",
			undo: undefined,
		});
	});

	it("勾选的用例原来都是目标状态：只提示，没有「撤销」", async () => {
		api.changeStatus.mockResolvedValueOnce({
			changes: [
				{
					previousStatus: "draft",
					testCase: { id: "case-a", status: "draft" },
					version: null,
				},
			],
		});
		const { view } = renderBatch();
		await act(async () => {
			await view.result.current({ ids: ["case-a"] }, "draft");
		});
		expect(successToast(0)).toEqual({
			message: "已将 1 条用例改为草稿，其中 1 条原来就是草稿",
			undo: undefined,
		});
	});

	it("保存失败：返回 false，不提示修改成功", async () => {
		api.changeStatus.mockRejectedValueOnce(new Error("断网"));
		const { view } = renderBatch();
		let succeeded: boolean | undefined;
		await act(async () => {
			succeeded = await view.result.current({ ids: BATCH_IDS }, "active");
		});
		expect(succeeded).toBe(false);
		expect(toast.success).not.toHaveBeenCalled();
	});

	it("全部符合筛选：按筛选条件修改，提示实际条数；撤销超过 100 条时也是一个请求", async () => {
		const ids = Array.from({ length: 150 }, (_, index) => `case-${index}`);
		api.changeStatus.mockResolvedValueOnce({
			changes: ids.map((id) => ({
				previousStatus: "draft",
				testCase: { id, status: "active" },
				version: { version: 2 },
			})),
		});
		const filter = caseListFilter("project-1", { status: "draft" });
		const { listedStatuses, view } = renderBatch();
		await act(async () => {
			await view.result.current({ filter }, "active");
		});
		// 不知道哪些用例符合筛选，所以列表不立刻更新，保存后重新载入
		expect(listedStatuses()).toEqual(BATCH.map((testCase) => testCase.status));
		expect(successToast(0).message).toBe("已将 150 条用例改为生效");
		await act(async () => successToast(0).undo?.());
		expect(api.changeStatus.mock.calls.map(([input]) => input)).toEqual([
			{ filter, status: "active" },
			{ ids, status: "draft", undo: true },
		]);
		expect(successToast(1).message).toBe("已恢复 150 条用例原来的状态");
	});
});
