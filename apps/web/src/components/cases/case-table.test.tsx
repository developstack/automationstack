import type { TestCase } from "@automationstack/db/schema/test-cases";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { CaseTable } from "@/components/cases/case-table";
import {
	type CaseSelection,
	useCaseSelection,
} from "@/components/cases/use-case-selection";
import { renderRoutes } from "@/test-dom-fixtures";

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

const queryClient = new QueryClient();

function QueryLayout() {
	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
		</QueryClientProvider>
	);
}

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const UPDATED_AT = new Date("2026-10-01T08:00:00Z");

function makeCase(id: string, name: string): TestCase {
	return {
		caseType: "functional",
		createdAt: UPDATED_AT,
		currentVersion: 1,
		id,
		lastModifiedBy: null,
		maintainer: null,
		moduleId: "00000000-0000-4000-8000-000000000002",
		name,
		preconditions: null,
		priority: "P1",
		projectId: PROJECT_ID,
		sortOrder: 0,
		sourceRef: null,
		status: "active",
		steps: [],
		tags: [],
		updatedAt: UPDATED_AT,
	};
}

const LOGIN = makeCase("case-login", "登录成功");
const LOGOUT = makeCase("case-logout", "退出登录");
const RESET = makeCase("case-reset", "重置密码");

interface HarnessControls {
	selection: () => CaseSelection;
	setCases: (cases: TestCase[]) => void;
	setStale: (stale: boolean) => void;
}

async function renderTable(
	initial: TestCase[],
	animateFirst = false
): Promise<
	HarnessControls & { router: ReturnType<typeof renderRoutes>["router"] }
> {
	// 每次渲染记下最新的勾选，测试读到的不是第一次渲染时的值
	let latestSelection: CaseSelection | undefined;
	const controls: Partial<HarnessControls> = {
		selection: () => {
			if (latestSelection === undefined) {
				throw new Error("表格还没有渲染");
			}
			return latestSelection;
		},
	};
	function Harness() {
		const [cases, setCases] = useState(initial);
		const [stale, setStale] = useState(false);
		const selection = useCaseSelection("scope");
		controls.setCases = setCases;
		controls.setStale = setStale;
		latestSelection = selection;
		return (
			<CaseTable
				animateFirst={animateFirst}
				cases={cases}
				selectedCaseId={undefined}
				selection={selection}
				stale={stale}
			/>
		);
	}
	const { router } = renderRoutes({
		initialPath: `/projects/${PROJECT_ID}`,
		layout: QueryLayout,
		routes: { "/projects/$projectId": Harness },
	});
	await screen.findByRole("table");
	return { ...(controls as HarnessControls), router };
}

const rowOf = (name: string) => screen.getByText(name).closest("tr");

describe("CaseTable：改筛选条件和翻页时，表格保留在原位", () => {
	it.each([
		["第一次显示时，行不单独淡入", false, undefined],
		["从空状态或骨架屏换成表格时，每一行都淡入", true, "true"],
	])("%s", async (_name, animateFirst, entering) => {
		await renderTable([LOGIN, LOGOUT], animateFirst);
		expect(rowOf("登录成功")?.dataset.entering).toBe(entering);
		expect(rowOf("退出登录")?.dataset.entering).toBe(entering);
	});

	it("加载新结果时，表格和原来的行留在原位，并标记为忙碌", async () => {
		const controls = await renderTable([LOGIN, LOGOUT]);
		const table = screen.getByRole("table");
		act(() => controls.setStale(true));
		expect(screen.getByRole("table")).toBe(table);
		expect(table.getAttribute("aria-busy")).toBe("true");
		expect(rowOf("登录成功")).not.toBeNull();
	});

	it("新结果到达后，只有新出现的行淡入，留下的行不变", async () => {
		const controls = await renderTable([LOGIN, LOGOUT]);
		const keptRow = rowOf("退出登录");
		act(() => controls.setCases([LOGOUT, RESET]));
		expect(rowOf("退出登录")).toBe(keptRow);
		expect(keptRow?.dataset.entering).toBeUndefined();
		expect(rowOf("重置密码")?.dataset.entering).toBe("true");
		expect(screen.queryByText("登录成功")).toBeNull();
		expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("false");
	});
});

describe("CaseTable：点状态标签直接修改用例状态", () => {
	it("点状态标签打开状态菜单，不打开用例详情；选中后立刻保存这条用例", async () => {
		api.changeStatus.mockResolvedValue({ changes: [] });
		const { router } = await renderTable([LOGIN, LOGOUT]);
		fireEvent.click(
			screen.getByRole("button", {
				name: "修改用例「退出登录」的状态，当前为生效",
			})
		);
		fireEvent.click(await screen.findByRole("menuitemradio", { name: "废弃" }));
		await waitFor(() =>
			expect(api.changeStatus.mock.calls[0]?.[0]).toEqual({
				ids: ["case-logout"],
				status: "deprecated",
			})
		);
		expect(router.state.location.search).not.toHaveProperty("caseId");
	});
});

describe("CaseTable：勾选用例", () => {
	const rowCheckbox = (name: string) =>
		screen.getByRole("checkbox", { name: `选择用例「${name}」` });
	const pageCheckbox = () =>
		screen.getByRole("checkbox", { name: "全选本页用例" });

	it("每行有勾选框；表头勾选框在部分选中时显示半选，点击后选中当前页，再点取消", async () => {
		const controls = await renderTable([LOGIN, LOGOUT]);
		fireEvent.click(rowCheckbox("登录成功"));
		expect(rowCheckbox("登录成功").getAttribute("aria-checked")).toBe("true");
		expect(pageCheckbox().getAttribute("aria-checked")).toBe("mixed");

		fireEvent.click(pageCheckbox());
		expect([...controls.selection().ids]).toEqual([
			"case-login",
			"case-logout",
		]);
		expect(pageCheckbox().getAttribute("aria-checked")).toBe("true");

		fireEvent.click(pageCheckbox());
		expect(controls.selection().ids.size).toBe(0);
		expect(pageCheckbox().getAttribute("aria-checked")).toBe("false");
	});

	it("翻到下一页：表头只看当前页，其他页的勾选保留", async () => {
		const controls = await renderTable([LOGIN, LOGOUT]);
		fireEvent.click(pageCheckbox());
		act(() => controls.setCases([RESET]));
		expect(pageCheckbox().getAttribute("aria-checked")).toBe("false");
		fireEvent.click(rowCheckbox("重置密码"));
		expect(controls.selection().ids.size).toBe(3);
	});

	it("勾选不打开用例详情；勾选后点名称仍然打开详情", async () => {
		const { router } = await renderTable([LOGIN, LOGOUT]);
		fireEvent.click(rowCheckbox("退出登录"));
		expect(router.state.location.search).not.toHaveProperty("caseId");
		fireEvent.click(screen.getByRole("link", { name: "退出登录" }));
		await waitFor(() =>
			expect(router.state.location.search).toMatchObject({
				caseId: "case-logout",
			})
		);
		expect(rowCheckbox("退出登录").getAttribute("aria-checked")).toBe("true");
	});
});
