import { SidebarProvider } from "@automationstack/ui/components/sidebar-context";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectNavGroup } from "@/components/layout/project-nav-group";

const PROJECT_ID = "p1";

// jsdom 没有 matchMedia；SidebarProvider 用它判断窄屏
function stubMatchMedia() {
	vi.stubGlobal("matchMedia", (query: string) => ({
		addEventListener: () => undefined,
		matches: false,
		media: query,
		removeEventListener: () => undefined,
	}));
}

async function renderNav() {
	const rootRoute = createRootRoute({
		component: () => (
			<SidebarProvider>
				<ProjectNavGroup projectId={PROJECT_ID} />
				<Outlet />
			</SidebarProvider>
		),
	});
	const pageRoute = createRoute({
		component: () => <p>页面</p>,
		getParentRoute: () => rootRoute,
		path: "/projects/$projectId/test-runs",
	});
	const router = createRouter({
		history: createMemoryHistory({
			initialEntries: [`/projects/${PROJECT_ID}/test-runs`],
		}),
		routeTree: rootRoute.addChildren([pageRoute]),
	});
	render(<RouterProvider router={router} />);
	await screen.findByText("页面");
}

describe("ProjectNavGroup：项目侧栏导航", () => {
	beforeEach(stubMatchMedia);
	afterEach(() => vi.unstubAllGlobals());

	it("只有一个列表，顺序是项目概览、用例管理、测试任务、成员、设置", async () => {
		await renderNav();
		const names = within(screen.getByRole("list"))
			.getAllByRole("link")
			.map((link) => link.getAttribute("aria-label"));
		expect(names).toEqual(["项目概览", "用例管理", "测试任务", "成员", "设置"]);
	});

	it("没有「工作」「项目」小标题", async () => {
		await renderNav();
		expect(screen.queryByText("工作")).toBeNull();
		expect(screen.queryByText("项目")).toBeNull();
	});

	it("链接和选中状态不变", async () => {
		await renderNav();
		const testRuns = screen.getByRole("link", { name: "测试任务" });
		expect(testRuns.getAttribute("href")).toBe(
			`/projects/${PROJECT_ID}/test-runs`
		);
		expect(testRuns.hasAttribute("data-active")).toBe(true);
		const overview = screen.getByRole("link", { name: "项目概览" });
		expect(overview.hasAttribute("data-active")).toBe(false);
	});
});
