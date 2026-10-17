import { act } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { caseListFilter } from "@/components/cases/case-list-query";
import {
	api,
	renderWithList,
	resetStatusChangeApi,
	successToast,
	UNDO_TOKEN,
	undoResult,
} from "@/components/cases/case-status-change-test-kit";
import { useCaseBatchStatusChange } from "@/components/cases/use-case-status-change";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/utils/orpc", async () => {
	const kit = await import("@/components/cases/case-status-change-test-kit");
	return kit.orpcMock;
});

beforeEach(() => {
	vi.clearAllMocks();
	resetStatusChangeApi();
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
		undoToken: UNDO_TOKEN,
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

	it.each<{
		level: "success" | "warning";
		message: string;
		name: string;
		restored: [string, string][];
		skippedIds: string[];
		statuses: string[];
	}>([
		{
			level: "success",
			message: "已恢复 3 条用例原来的状态",
			name: "一个请求恢复每条用例原来的状态，原来就是目标状态的用例不动",
			restored: [
				["case-a", "draft"],
				["case-b", "active"],
				["case-c", "draft"],
			],
			skippedIds: [],
			statuses: ["draft", "active", "draft", "deprecated"],
		},
		{
			level: "warning",
			message:
				"已恢复 2 条用例原来的状态，1 条在修改后又被改过，保留现在的状态",
			name: "修改后又被改过的用例由服务端跳过，提示跳过的条数",
			restored: [
				["case-a", "draft"],
				["case-c", "draft"],
			],
			skippedIds: ["case-b"],
			statuses: ["draft", "deprecated", "draft", "deprecated"],
		},
	])(
		"撤销：$name",
		async ({ level, message, restored, skippedIds, statuses }) => {
			api.changeStatus.mockResolvedValueOnce(batchResult("deprecated"));
			api.undoStatusChange.mockResolvedValueOnce(
				undoResult(restored, skippedIds)
			);
			const { listedStatuses, view } = renderBatch();
			await act(async () => {
				await view.result.current({ ids: BATCH_IDS }, "deprecated");
			});
			await act(async () => successToast(0).undo?.());
			expect(api.undoStatusChange.mock.calls.map(([input]) => input)).toEqual([
				{ token: UNDO_TOKEN },
			]);
			expect(listedStatuses()).toEqual(statuses);
			expect(toast[level]).toHaveBeenLastCalledWith(message);
		}
	);

	it("勾选的用例原来都是目标状态（没有撤销凭证）：只提示，没有「撤销」", async () => {
		api.changeStatus.mockResolvedValueOnce({
			changes: [
				{
					previousStatus: "draft",
					testCase: { id: "case-a", status: "draft" },
					version: null,
				},
			],
			undoToken: null,
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
			undoToken: UNDO_TOKEN,
		});
		api.undoStatusChange.mockResolvedValueOnce(
			undoResult(ids.map((id) => [id, "draft"]))
		);
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
		]);
		expect(api.undoStatusChange.mock.calls.map(([input]) => input)).toEqual([
			{ token: UNDO_TOKEN },
		]);
		expect(successToast(1).message).toBe("已恢复 150 条用例原来的状态");
	});
});
