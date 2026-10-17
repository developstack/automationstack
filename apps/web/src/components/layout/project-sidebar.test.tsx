import { SidebarProvider } from "@automationstack/ui/components/sidebar-context";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectSidebar } from "@/components/layout/project-sidebar";
import { BRAND_NAME } from "@/components/layout/sidebar-brand";
import { stubMatchMedia } from "@/test-dom-fixtures";

stubMatchMedia();

vi.mock("@/components/layout/project-switcher", () => ({
	ProjectSwitcher: ({ projectName }: { projectName: string }) => (
		<button type="button">{`切换项目：${projectName}`}</button>
	),
}));
vi.mock("@/components/layout/project-nav-group", () => ({
	ProjectNavGroup: () => null,
}));
vi.mock("@/components/layout/sidebar-user", () => ({
	SidebarUser: () => null,
}));

const PROJECT_ID = "p1";
const PROJECT_NAME = "支付网关";
const EXPAND_LABEL = "展开侧边栏";
const SWITCHER_NAME = /^切换项目/;

function renderSidebar(projectName: string | undefined, defaultOpen = true) {
	render(
		<SidebarProvider defaultOpen={defaultOpen}>
			<ProjectSidebar projectId={PROJECT_ID} projectName={projectName} />
		</SidebarProvider>
	);
}

const sidebarState = () =>
	document.querySelector("[data-slot=sidebar]")?.getAttribute("data-state");

describe("ProjectSidebar：项目以内的侧栏顶部", () => {
	it("只显示项目切换器，不显示平台的名称；切换侧栏的按钮不在侧栏中", () => {
		renderSidebar(PROJECT_NAME);
		expect(screen.queryByText(BRAND_NAME)).toBeNull();
		expect(
			screen.getByRole("button", { name: `切换项目：${PROJECT_NAME}` })
		).toBeTruthy();
		expect(document.querySelector("[data-slot=sidebar-trigger]")).toBeNull();
	});

	it("收起时的按钮显示项目名的首字，点击后展开侧栏", () => {
		renderSidebar(PROJECT_NAME, false);
		const expand = screen.getByRole("button", { name: EXPAND_LABEL });
		expect(expand.textContent).toBe(`支${PROJECT_NAME}`);
		expect(sidebarState()).toBe("collapsed");
		fireEvent.click(expand);
		expect(sidebarState()).toBe("expanded");
	});

	it("项目名加载中时不显示切换器，收起按钮的名称是「项目」", () => {
		renderSidebar(undefined);
		expect(screen.queryByRole("button", { name: SWITCHER_NAME })).toBeNull();
		expect(screen.getByRole("button", { name: EXPAND_LABEL }).textContent).toBe(
			"项目"
		);
	});
});
