import type { TestCase } from "@automationstack/db/schema/test-cases";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { vi } from "vitest";

/**
 * 改用例状态的 hook 测试共用的替身和构造函数（use-case-status-change.test.tsx 和
 * use-case-batch-status-change.test.tsx）。测试文件用 vi.mock 把 @/utils/orpc 换成 orpcMock，
 * 把 sonner 换成只有 success 和 warning 的 toast。
 */

export const api = {
	changeStatus: vi.fn<(input: unknown) => Promise<unknown>>(),
	undoStatusChange: vi.fn<(input: unknown) => Promise<unknown>>(),
};

export const orpcMock = {
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
			undoStatusChange: {
				mutationOptions: (options: object) => ({
					...options,
					mutationFn: api.undoStatusChange,
				}),
			},
		},
		mindmap: { key: () => ["mindmap"] },
	},
};

export const UNDO_TOKEN = "undo-token";

const LIST_KEY = ["cases", "list", { page: 1 }];

/** 在已经载入一页用例列表的环境中渲染 hook。listedStatuses 读出列表中每条用例现在的状态。 */
export function renderWithList<T>(
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

/** 第 index 个成功提示的文字和其中「撤销」的点击处理。 */
export function successToast(index: number) {
	const call = vi.mocked(toast.success).mock.calls[index];
	return {
		message: call?.[0],
		undo: (call?.[1]?.action as { onClick: () => void } | undefined)?.onClick,
	};
}

/** 撤销的返回：恢复的用例（带恢复后的状态）和跳过的用例。 */
export function undoResult(
	restored: [string, string][],
	skippedIds: string[] = []
) {
	return {
		changes: restored.map(([id, status]) => ({ testCase: { id, status } })),
		skippedIds,
	};
}

/** 每个测试前（vi.clearAllMocks 之后）设置默认返回：修改返回撤销凭证，撤销什么都不恢复。 */
export function resetStatusChangeApi(): void {
	api.changeStatus.mockResolvedValue({ changes: [], undoToken: UNDO_TOKEN });
	api.undoStatusChange.mockResolvedValue(undoResult([]));
}
