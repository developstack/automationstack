import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { RunCaseList } from "@/components/test-runs/run-case-list";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { hoverTooltipText, markTruncated } from "@/test-dom-fixtures";

function node(
	id: string,
	name: string,
	children: ModuleTreeNode[] = [],
	parentId: string | null = null
): ModuleTreeNode {
	return { children, id, name, parentId, projectId: "p1", sortOrder: 0 };
}

const tree: ModuleTreeNode[] = [
	node("model", "模型网关", [node("vendor", "供应商", [], "model")]),
];

vi.mock("@/utils/orpc", () => ({
	orpc: {
		modules: {
			tree: {
				queryOptions: () => ({
					queryFn: async () => tree,
					queryKey: ["modules", "tree"],
				}),
			},
		},
	},
}));

function detail(
	id: string,
	moduleId: string,
	moduleName: string,
	name: string
): RunCaseDetail {
	return {
		runCase: { assigneeId: null, id, result: "untested" },
		testCase: {
			id: `case-${id}`,
			moduleId,
			moduleName,
			name,
			priority: "P2",
		},
	} as unknown as RunCaseDetail;
}

const vendorCase = detail("r1", "vendor", "供应商", "新增供应商");
const modelCase = detail("r2", "model", "模型网关", "查看模型列表");

function renderList(cases: readonly RunCaseDetail[]) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return render(
		<RunCaseList
			canConclude
			canEditCases
			cases={cases}
			checkedIds={new Set<string>()}
			filter={{ assignee: "all", moduleId: undefined, result: undefined }}
			moduleOptions={[]}
			onAddCases={vi.fn()}
			onAssignToMe={vi.fn()}
			onBulkPass={vi.fn()}
			onFilterChange={vi.fn()}
			onRemoveCases={vi.fn()}
			onSelect={vi.fn()}
			onToggleAll={vi.fn()}
			onToggleChecked={vi.fn()}
			projectId="p1"
			runId="run-1"
			selectedModuleId="vendor"
			selectedRunCaseId="r1"
		/>,
		{ wrapper }
	);
}

describe("RunCaseList：左栏按模块分组", () => {
	it("groups the cases under their modules; hovering a case shows its full name", async () => {
		renderList([vendorCase, modelCase]);

		expect(
			await screen.findByRole("button", { name: "模型网关 模块，2 条用例" })
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "供应商 模块，1 条用例" })
		).toBeDefined();
		for (const name of ["新增供应商", "查看模型列表"]) {
			const text = screen.getByText(name);
			markTruncated(text);
			// biome-ignore lint/performance/noAwaitInLoops: 一次只能悬停一个用例
			expect(await hoverTooltipText(text)).toBe(name);
		}
	});

	it("says so when the filter hides every case", () => {
		renderList([]);

		expect(screen.getByText("当前筛选下没有用例。")).toBeDefined();
	});
});
