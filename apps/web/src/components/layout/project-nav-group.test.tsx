import { SidebarProvider } from "@automationstack/ui/components/sidebar-context";
import { Outlet } from "@tanstack/react-router";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectNavGroup } from "@/components/layout/project-nav-group";
import { renderRoutes, stubMatchMedia } from "@/test-dom-fixtures";

const PROJECT_ID = "p1";

stubMatchMedia();

async function renderNav() {
	renderRoutes({
		initialPath: `/projects/${PROJECT_ID}/test-runs`,
		layout: () => (
			<SidebarProvider>
				<ProjectNavGroup projectId={PROJECT_ID} />
				<Outlet />
			</SidebarProvider>
		),
		routes: { "/projects/$projectId/test-runs": () => <p>页面</p> },
	});
	await screen.findByText("页面");
}

describe("ProjectNavGroup：项目侧栏导航", () => {
	it("只有一个列表，顺序是项目概览、用例管理、测试任务、成员、设置；没有「工作」「项目」小标题", async () => {
		await renderNav();
		const names = within(screen.getByRole("list"))
			.getAllByRole("link")
			.map((link) => link.getAttribute("aria-label"));
		expect(names).toEqual(["项目概览", "用例管理", "测试任务", "成员", "设置"]);
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
