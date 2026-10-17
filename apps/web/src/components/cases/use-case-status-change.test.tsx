import type { TestCase } from "@automationstack/db/schema/test-cases";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCaseStatusChange } from "@/components/cases/use-case-status-change";

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

function renderChange() {
	const queryClient = new QueryClient();
	queryClient.setQueryData(LIST_KEY, {
		items: [{ id: CASE_ID, status: "active" } as TestCase],
		total: 1,
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	const view = renderHook(() => useCaseStatusChange(), { wrapper });
	const listedStatus = () =>
		queryClient.getQueryData<{ items: TestCase[] }>(LIST_KEY)?.items[0]?.status;
	return { listedStatus, view };
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
