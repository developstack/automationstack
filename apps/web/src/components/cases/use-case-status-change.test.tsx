import { act, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	api,
	renderWithList,
	resetStatusChangeApi,
	successToast,
	UNDO_TOKEN,
	undoResult,
} from "@/components/cases/case-status-change-test-kit";
import { useCaseStatusChange } from "@/components/cases/use-case-status-change";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/utils/orpc", async () => {
	const kit = await import("@/components/cases/case-status-change-test-kit");
	return kit.orpcMock;
});

beforeEach(() => {
	vi.clearAllMocks();
	resetStatusChangeApi();
});

const CASE_ID = "case-login";
const TO_DRAFT = { caseId: CASE_ID, from: "active", to: "draft" } as const;

function renderChange() {
	const { listedStatuses, view } = renderWithList(useCaseStatusChange, [
		{ id: CASE_ID, status: "active" },
	]);
	return { listedStatus: () => listedStatuses()?.[0], view };
}

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
			finish({ changes: [], undoToken: UNDO_TOKEN });
			await changing;
		});
		expect(toast.success).toHaveBeenCalledWith("已改为废弃", {
			action: { label: "撤销", onClick: expect.any(Function) },
		});
	});

	it.each<{
		level: "success" | "warning";
		message: string;
		name: string;
		result: ReturnType<typeof undoResult>;
		status: string;
	}>([
		{
			level: "success",
			message: "已恢复为生效",
			name: "凭修改返回的撤销凭证恢复原来的状态",
			result: undoResult([[CASE_ID, "active"]]),
			status: "active",
		},
		{
			level: "warning",
			message: "用例在修改后又被改过，保留现在的状态",
			name: "用例在修改后又被改过：服务端跳过，保留现在的状态",
			result: undoResult([], [CASE_ID]),
			status: "draft",
		},
	])("撤销：$name", async ({ level, message, result, status }) => {
		api.undoStatusChange.mockResolvedValueOnce(result);
		const { listedStatus, view } = renderChange();
		await act(async () => view.result.current(TO_DRAFT));
		await act(async () => successToast(0).undo?.());
		expect(api.changeStatus).toHaveBeenCalledTimes(1);
		expect(api.undoStatusChange.mock.calls.map(([input]) => input)).toEqual([
			{ token: UNDO_TOKEN },
		]);
		expect(listedStatus()).toBe(status);
		expect(toast[level]).toHaveBeenLastCalledWith(message);
	});

	it("状态没有变化（没有撤销凭证）：只提示，没有「撤销」", async () => {
		api.changeStatus.mockResolvedValueOnce({ changes: [], undoToken: null });
		const { view } = renderChange();
		await act(async () => view.result.current(TO_DRAFT));
		expect(successToast(0)).toEqual({ message: "已改为草稿", undo: undefined });
	});

	it("保存失败：不提示修改成功（失败原因由全局的失败提示显示）", async () => {
		api.changeStatus.mockRejectedValueOnce(new Error("断网"));
		const { view } = renderChange();
		await act(async () => view.result.current(TO_DRAFT));
		expect(toast.success).not.toHaveBeenCalled();
	});
});
