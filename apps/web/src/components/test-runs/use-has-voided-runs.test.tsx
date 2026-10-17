import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import type { TestRunsSearch } from "@/components/test-runs/test-runs-search";
import { useHasVoidedRuns } from "@/components/test-runs/use-has-voided-runs";

const api = vi.hoisted(() => ({
	list: vi.fn<(input: unknown) => Promise<unknown[]>>(),
}));

vi.mock("@/utils/orpc", () => ({
	orpc: {
		testRuns: {
			list: {
				queryOptions: ({
					input,
					...options
				}: {
					enabled?: boolean;
					input: unknown;
				}) => ({
					...options,
					queryFn: () => api.list(input),
					queryKey: ["testRuns", "list", input],
				}),
			},
		},
	},
}));

function renderHasVoided(search: TestRunsSearch, listEmpty: boolean) {
	const client = new QueryClient();
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return renderHook(() => useHasVoidedRuns("project-1", search, listEmpty), {
		wrapper,
	}).result;
}

beforeEach(() => {
	vi.clearAllMocks();
});

it.each<[string, unknown[], boolean]>([
	["有已作废的测试任务", [{ run: { id: "run-1" } }], true],
	["没有已作废的测试任务", [], false],
])(
	"不筛选、列表为空，%s：按「已作废」查一次列表",
	async (_name, voided, expected) => {
		api.list.mockResolvedValue(voided);
		const result = renderHasVoided({}, true);
		// 查询返回前还不知道，为 undefined：列表等它返回再显示空列表的说明
		expect(result.current).toBeUndefined();
		await waitFor(() => expect(result.current).toBe(expected));
		expect(api.list).toHaveBeenCalledExactlyOnceWith({
			keyword: undefined,
			projectId: "project-1",
			status: "voided",
		});
	}
);

it.each<[string, TestRunsSearch, boolean]>([
	["列表不为空", {}, false],
	["有关键词", { runKeyword: "登录" }, true],
	["选了状态", { runStatus: "submitted" }, true],
])("%s：不查询，返回 false", (_name, search, listEmpty) => {
	const result = renderHasVoided(search, listEmpty);
	expect(result.current).toBe(false);
	expect(api.list).not.toHaveBeenCalled();
});
