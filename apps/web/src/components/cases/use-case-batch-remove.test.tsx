import { MAX_BATCH_CASES } from "@automationstack/api/schemas/case";
import { act } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, expect, it, vi } from "vitest";

import { caseListFilter } from "@/components/cases/case-list-query";
import {
	api,
	renderWithList,
	resetStatusChangeApi,
	successToast,
} from "@/components/cases/case-status-change-test-kit";
import { useCaseBatchRemove } from "@/components/cases/use-case-batch-remove";
import type { CaseBatchTarget } from "@/components/cases/use-case-selection";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/utils/orpc", async () => {
	const kit = await import("@/components/cases/case-status-change-test-kit");
	return kit.orpcMock;
});

beforeEach(() => {
	vi.clearAllMocks();
	resetStatusChangeApi();
});

const FILTER = caseListFilter("project-1", {});

function caseIds(count: number, prefix = "case"): string[] {
	return Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
}

/** 服务端对批量删除的返回：删除和跳过（被测试任务用到）的用例。 */
function removeResult(deleted: string[], skipped: string[]) {
	return {
		deleted: deleted.map((id) => ({ id, name: id })),
		missingIds: [],
		skipped: skipped.map((id) => ({ id, name: id, referencedByRunCount: 1 })),
	};
}

async function removeWith(target: CaseBatchTarget) {
	const { view } = renderWithList(useCaseBatchRemove, []);
	await act(() => view.result.current(target));
}

/** 第一个警告提示中的操作按钮。没有按钮时为 undefined。 */
function warningAction() {
	const options = vi.mocked(toast.warning).mock.calls[0]?.[1];
	return options?.action as { onClick: () => void } | undefined;
}

it("点击「改为废弃」：用批量改状态把跳过的用例改为废弃，可以撤销", async () => {
	api.removeMany.mockResolvedValue(removeResult(["case-0"], ["case-1"]));
	api.changeStatus.mockResolvedValue({
		changes: [{ testCase: { id: "case-1" }, version: { version: 2 } }],
		undoToken: "undo-token",
	});
	await removeWith({ ids: caseIds(2) });

	const action = warningAction();
	await act(async () => {
		action?.onClick();
		await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
	});

	expect(api.changeStatus).toHaveBeenCalledExactlyOnceWith(
		{ ids: ["case-1"], status: "deprecated" },
		expect.anything()
	);
	expect(successToast(0).message).toBe("已将 1 条用例改为废弃");
	expect(successToast(0).undo).toBeTypeOf("function");
});

it.each([
	{
		expected: { ids: caseIds(MAX_BATCH_CASES, "skipped") },
		name: `跳过 ${MAX_BATCH_CASES} 条：按跳过的用例 id 修改`,
		skipped: MAX_BATCH_CASES,
	},
	{
		expected: { filter: FILTER },
		name: `跳过超过 ${MAX_BATCH_CASES} 条：按删除时的筛选条件修改，删除后还符合筛选的就是跳过的用例`,
		skipped: MAX_BATCH_CASES + 1,
	},
])("按筛选条件删除，$name", async ({ expected, skipped }) => {
	api.removeMany.mockResolvedValue(
		removeResult([], caseIds(skipped, "skipped"))
	);
	await removeWith({ filter: FILTER });
	await act(async () => {
		warningAction()?.onClick();
		await vi.waitFor(() => expect(api.changeStatus).toHaveBeenCalled());
	});
	expect(api.changeStatus.mock.calls[0]?.[0]).toEqual({
		...expected,
		status: "deprecated",
	});
});
