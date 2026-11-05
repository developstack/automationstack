import {
	FILTER_BATCH_TOO_MANY_MESSAGE,
	MAX_FILTER_BATCH_CASES,
} from "@automationstack/api/schemas/case";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaseListBatchActions } from "@/components/cases/case-list-batch-actions";
import { caseListFilter } from "@/components/cases/case-list-query";
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
			undoStatusChange: { mutationOptions: (options: object) => options },
		},
		mindmap: { key: () => ["mindmap"] },
	},
}));

const FILTER = caseListFilter("project-1", { status: "draft" });
const PAGE_IDS = Array.from({ length: 20 }, (_, index) => `case-${index}`);

interface RenderOptions {
	allMatching?: boolean;
	ids?: string[];
	total?: number;
}

function renderActions({
	allMatching = false,
	ids = PAGE_IDS,
	total = 57,
}: RenderOptions = {}) {
	const selection: CaseSelection = {
		allMatching,
		clear: vi.fn(),
		ids: new Set(ids),
		selectAllMatching: vi.fn(),
		toggle: vi.fn(),
		togglePage: vi.fn(),
	};
	render(
		<QueryClientProvider client={new QueryClient()}>
			<CaseListBatchActions
				filter={FILTER}
				page={{ items: PAGE_IDS.map((id) => ({ id })), total }}
				selection={selection}
			/>
		</QueryClientProvider>
	);
	return selection;
}

const SELECT_ALL_NAME = /^选择全部 \d+ 条符合筛选的用例$/;

const bar = () => screen.getByRole("region", { name: "批量操作" });
const selectAllButton = () =>
	screen.queryByRole("button", { name: SELECT_ALL_NAME });

beforeEach(() => {
	vi.clearAllMocks();
});

describe("CaseListBatchActions：选择全部符合筛选的用例", () => {
	it("当前页全选、还有其他页：显示「已选本页 20 条」，点「选择全部 57 条符合筛选的用例」选择全部", () => {
		const selection = renderActions();
		expect(bar().textContent).toContain("已选本页 20 条");
		fireEvent.click(
			screen.getByRole("button", { name: "选择全部 57 条符合筛选的用例" })
		);
		expect(selection.selectAllMatching).toHaveBeenCalled();
	});

	it.each<[string, RenderOptions]>([
		["当前页没有全选", { ids: PAGE_IDS.slice(0, 3) }],
		["符合筛选的用例都在当前页", { total: 20 }],
		["已经选择了全部", { allMatching: true }],
	])("%s：不显示「选择全部」", (_name, options) => {
		renderActions(options);
		expect(selectAllButton()).toBeNull();
	});

	it("选择全部后：显示「已选全部 57 条符合筛选的用例」，「取消全部选择」清空", () => {
		const selection = renderActions({ allMatching: true });
		expect(bar().textContent).toContain("已选全部 57 条符合筛选的用例");
		expect(screen.queryByRole("button", { name: "取消选择" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "取消全部选择" }));
		expect(selection.clear).toHaveBeenCalled();
	});

	it("选择全部后改状态：一个请求，发送筛选条件而不是 id", async () => {
		api.changeStatus.mockResolvedValue({ changes: [], undoToken: null });
		const selection = renderActions({ allMatching: true });
		fireEvent.click(screen.getByRole("button", { name: "改状态" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "废弃" }));
		await waitFor(() => expect(selection.clear).toHaveBeenCalled());
		expect(api.changeStatus.mock.calls.map(([input]) => input)).toEqual([
			{ filter: FILTER, status: "deprecated" },
		]);
	});

	it("选择全部后删除：确认弹窗显示全部条数，一个请求发送筛选条件", async () => {
		api.removeMany.mockResolvedValue({
			deleted: [],
			missingIds: [],
			skipped: [],
		});
		const selection = renderActions({ allMatching: true });
		fireEvent.click(screen.getByRole("button", { name: "删除" }));
		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("删除 57 条用例？");
		fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));
		await waitFor(() => expect(selection.clear).toHaveBeenCalled());
		expect(api.removeMany.mock.calls.map(([input]) => input)).toEqual([
			{ filter: FILTER },
		]);
	});

	it(`符合筛选的用例超过 ${MAX_FILTER_BATCH_CASES} 条：不显示「改状态」和「删除」，提示缩小筛选范围`, () => {
		renderActions({ allMatching: true, total: MAX_FILTER_BATCH_CASES + 1 });
		expect(screen.queryByRole("button", { name: "改状态" })).toBeNull();
		expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
		expect(screen.getByText(FILTER_BATCH_TOO_MANY_MESSAGE)).not.toBeNull();
	});
});
