import type { RouteComponent } from "@tanstack/react-router";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthSettingsShell } from "@/components/auth-settings/auth-settings-shell";
import { RouteError } from "@/components/layout/route-error";
import { UsersShell } from "@/components/platform-users/users-shell";
import { ProjectsShell } from "@/components/projects/projects-shell";
import { renderRoutes, stubMatchMedia } from "@/test-dom-fixtures";

stubMatchMedia();

vi.mock("@/components/layout/platform-sidebar", () => ({
	PlatformSidebar: () => null,
}));
// 读 cookie 的函数在服务端分支需要 Start 的运行时，测试中没有
vi.mock("@/components/layout/sidebar-state", () => ({
	readSidebarDefaultOpen: () => true,
}));

const PAGE_BODY = "页面内容";
const MAX_WIDTH = /^max-w-/;
/** 与项目以内的页面（p-4）相同的左右内边距。 */
const INLINE_PADDING = ["p-4", "px-4"];

const AuthSettingsPage: RouteComponent = () => (
	<AuthSettingsShell phase="ready">
		<p>{PAGE_BODY}</p>
	</AuthSettingsShell>
);

const RouteErrorPage: RouteComponent = () => (
	<RouteError error={new Error(PAGE_BODY)} reset={vi.fn()} />
);

const PAGES: [string, RouteComponent][] = [
	[
		"项目列表",
		() => (
			<ProjectsShell phase="ready">
				<h1>{PAGE_BODY}</h1>
			</ProjectsShell>
		),
	],
	[
		"平台用户管理",
		() => (
			<UsersShell phase="ready">
				<h1>{PAGE_BODY}</h1>
			</UsersShell>
		),
	],
	["认证设置", AuthSettingsPage],
	["路由出错页", RouteErrorPage],
];

async function renderPage(page: RouteComponent) {
	renderRoutes({ initialPath: "/", routes: { "/": page } });
	return await screen.findByRole("heading", { level: 1 });
}

/** 页面标题到 main 之间的外框，不含 Empty 等组件自己的内部结构。 */
function frameOf(heading: HTMLElement): Element[] {
	const frame: Element[] = [];
	let node: Element | null = heading.parentElement;
	while (node !== null) {
		if (!node.getAttribute("data-slot")?.startsWith("empty")) {
			frame.push(node);
		}
		if (node.tagName === "MAIN") {
			return frame;
		}
		node = node.parentElement;
	}
	throw new Error("页面标题不在 main 中");
}

describe("项目以外的页面：内容靠左，宽度由内容决定", () => {
	it.each(PAGES)(
		"%s：外框不居中、不限整页宽度，左右内边距与项目内页面相同",
		async (_name, page) => {
			const frame = frameOf(await renderPage(page));
			const classes = frame.flatMap((element) => [...element.classList]);

			expect(classes).not.toContain("mx-auto");
			expect(classes).not.toContain("container");
			expect(classes.filter((name) => MAX_WIDTH.test(name))).toEqual([]);
			expect(classes.some((name) => INLINE_PADDING.includes(name))).toBe(true);
		}
	);

	it("认证设置：表单区域靠左，最大宽度为 max-w-3xl", async () => {
		await renderPage(AuthSettingsPage);
		const form = screen.getByText(PAGE_BODY).parentElement;

		expect(form?.classList.contains("max-w-3xl")).toBe(true);
		expect(form?.classList.contains("mx-auto")).toBe(false);
	});

	it("路由出错页：提示和按钮靠左，不在内容区居中", async () => {
		await renderPage(RouteErrorPage);
		const empty = document.querySelector("[data-slot='empty']");

		expect(empty?.classList.contains("items-start")).toBe(true);
		expect(empty?.classList.contains("text-center")).toBe(false);
	});
});
