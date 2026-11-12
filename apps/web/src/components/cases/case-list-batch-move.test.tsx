import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	caseIds,
	caseRef,
	currentQueryClient,
	LOGIN_MODULE,
	MODULES,
	renderActions,
} from "@/components/cases/case-list-batch-actions-test-kit";
import { api } from "@/components/cases/case-list-batch-orpc-mock";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/utils/orpc", async () => {
	const mock = await import("@/components/cases/case-list-batch-orpc-mock");
	return mock.orpcMock;
});

beforeEach(() => {
	vi.clearAllMocks();
	api.moduleTree.mockResolvedValue(MODULES);
	api.moveImpact.mockResolvedValue({ runs: [] });
});

const moveButton = () => screen.queryByRole("button", { name: "移动到模块" });

/** 点「移动到模块」，在弹窗中选择模块。返回弹窗。 */
async function chooseModule(name: string) {
	fireEvent.click(await screen.findByRole("button", { name: "移动到模块" }));
	const dialog = await screen.findByRole("dialog");
	fireEvent.click(within(dialog).getByRole("button", { name }));
	return dialog;
}

describe("CaseListBatchActions：移动到模块", () => {
	it("项目只有一个模块：没有可以移到的模块，不显示「移动到模块」", async () => {
		api.moduleTree.mockResolvedValue([LOGIN_MODULE]);
		renderActions(caseIds(2));
		await waitFor(() => expect(api.moduleTree).toHaveBeenCalled());
		expect(await screen.findByRole("button", { name: "删除" })).not.toBeNull();
		expect(moveButton()).toBeNull();
	});

	it("弹窗列出所有模块（包括子模块）；选中前不能确认，选中后显示模块名；点「取消」不移动", async () => {
		renderActions(caseIds(3));
		fireEvent.click(await screen.findByRole("button", { name: "移动到模块" }));
		const dialog = await screen.findByRole("dialog");
		expect(dialog.textContent).toContain("移动 3 条用例");
		expect(dialog.textContent).toContain("请选择目标模块");
		const confirm = within(dialog).getByRole("button", { name: "确认移动" });
		expect(confirm.hasAttribute("disabled")).toBe(true);

		fireEvent.click(within(dialog).getByRole("button", { name: "短信验证码" }));
		expect(dialog.textContent).toContain("移动到「短信验证码」");
		expect(confirm.hasAttribute("disabled")).toBe(false);

		fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(api.moveMany).not.toHaveBeenCalled();
	});

	it.each([
		{
			message: "已移动 2 条用例到「登录」",
			missingIds: [],
			moved: ["case-0", "case-1"],
			syncedRunIds: [],
			unchanged: [],
		},
		{
			message:
				"已移动 1 条用例到「登录」，1 条已在这个模块中，另有 1 条已不存在，2 个进行中的测试任务已同步修改",
			missingIds: ["case-2"],
			moved: ["case-0"],
			syncedRunIds: ["run-1", "run-2"],
			unchanged: ["case-1"],
		},
	])(
		"确认后一个请求移动所有勾选的用例，提示「$message」，清空勾选，重新载入列表",
		async ({ message, missingIds, moved, syncedRunIds, unchanged }) => {
			api.moveMany.mockResolvedValue({
				missingIds,
				moved: moved.map(caseRef),
				syncedRunIds,
				unchanged: unchanged.map(caseRef),
			});
			const selection = renderActions(caseIds(3));
			const invalidate = vi.spyOn(currentQueryClient(), "invalidateQueries");
			const dialog = await chooseModule("登录");
			fireEvent.click(within(dialog).getByRole("button", { name: "确认移动" }));
			await waitFor(() => expect(selection.clear).toHaveBeenCalled());
			expect(api.moveMany).toHaveBeenCalledTimes(1);
			expect(api.moveMany.mock.calls[0]?.[0]).toEqual({
				ids: caseIds(3),
				moduleId: "m-login",
			});
			expect(vi.mocked(toast.success)).toHaveBeenCalledWith(message);
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cases"] });
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ["mindmap"] });
		}
	);

	it("请求还没有完成：显示「正在移动…」，不显示批量操作", async () => {
		api.moveMany.mockReturnValue(new Promise(() => undefined));
		renderActions(caseIds(2));
		const dialog = await chooseModule("登录");
		fireEvent.click(within(dialog).getByRole("button", { name: "确认移动" }));
		expect(await screen.findByText("正在移动…")).not.toBeNull();
		expect(moveButton()).toBeNull();
	});

	it("移动失败：保留勾选，可以再移动", async () => {
		api.moveMany.mockRejectedValue(new Error("断网"));
		const selection = renderActions(caseIds(2));
		const dialog = await chooseModule("登录");
		fireEvent.click(within(dialog).getByRole("button", { name: "确认移动" }));
		await waitFor(() => expect(moveButton()).not.toBeNull());
		expect(selection.clear).not.toHaveBeenCalled();
	});

	it("用例在进行中的测试任务中：再弹窗列出这些测试任务；取消不移动，确认后才移动", async () => {
		api.moveImpact.mockResolvedValue({
			runs: [
				{ id: "run-1", name: "回归一", status: "in_progress" },
				{ id: "run-2", name: "冒烟", status: "pending_review" },
			],
		});
		api.moveMany.mockResolvedValue({
			missingIds: [],
			moved: [caseRef("case-0")],
			syncedRunIds: ["run-1", "run-2"],
			unchanged: [],
		});
		const selection = renderActions(caseIds(1));
		const dialog = await chooseModule("登录");
		fireEvent.click(within(dialog).getByRole("button", { name: "确认移动" }));

		const confirm = await screen.findByRole("alertdialog");
		expect(confirm.textContent).toContain("同时修改 2 个进行中的测试任务？");
		expect(confirm.textContent).toContain("模块也改为「登录」");
		expect(confirm.textContent).toContain("回归一测试中");
		expect(confirm.textContent).toContain("冒烟待评审");
		expect(api.moveImpact.mock.calls[0]?.[0]).toEqual({
			ids: caseIds(1),
			moduleId: "m-login",
		});
		fireEvent.click(within(confirm).getByRole("button", { name: "取消" }));
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		expect(api.moveMany).not.toHaveBeenCalled();

		const again = await chooseModule("登录");
		fireEvent.click(within(again).getByRole("button", { name: "确认移动" }));
		const second = await screen.findByRole("alertdialog");
		fireEvent.click(within(second).getByRole("button", { name: "确认移动" }));
		await waitFor(() => expect(selection.clear).toHaveBeenCalled());
		expect(api.moveMany).toHaveBeenCalledTimes(1);
	});

	it("检查测试任务失败：不移动，保留勾选", async () => {
		api.moveImpact.mockRejectedValue(new Error("断网"));
		const selection = renderActions(caseIds(1));
		const dialog = await chooseModule("登录");
		fireEvent.click(within(dialog).getByRole("button", { name: "确认移动" }));
		await waitFor(() => expect(api.moveImpact).toHaveBeenCalled());
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(api.moveMany).not.toHaveBeenCalled();
		expect(selection.clear).not.toHaveBeenCalled();
	});
});
