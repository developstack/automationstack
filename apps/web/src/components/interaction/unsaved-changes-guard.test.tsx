import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UnsavedChangesGuard } from "@/components/interaction/unsaved-changes-guard";

const LEAVE_TITLE = "放弃未保存的修改？";

function renderAt(dirty: boolean) {
	const rootRoute = createRootRoute({ component: Outlet });
	const formRoute = createRoute({
		component: () => (
			<>
				<UnsavedChangesGuard dirty={dirty} />
				<p>表单页面</p>
			</>
		),
		getParentRoute: () => rootRoute,
		path: "/",
	});
	const otherRoute = createRoute({
		component: () => <p>别的页面</p>,
		getParentRoute: () => rootRoute,
		path: "/other",
	});
	const loginRoute = createRoute({
		component: () => <p>登录页面</p>,
		getParentRoute: () => rootRoute,
		path: "/login",
	});
	const history = createMemoryHistory({ initialEntries: ["/"] });
	const router = createRouter({
		history,
		routeTree: rootRoute.addChildren([formRoute, otherRoute, loginRoute]),
	});
	render(<RouterProvider router={router} />);
	return { history, router };
}

async function leave(
	history: ReturnType<typeof createMemoryHistory>,
	to = "/other"
) {
	await screen.findByText("表单页面");
	act(() => history.push(to));
}

describe("UnsavedChangesGuard：未保存离开提醒", () => {
	it("没有修改时直接离开", async () => {
		const { history } = renderAt(false);
		await leave(history);
		expect(await screen.findByText("别的页面")).toBeDefined();
		expect(screen.queryByText(LEAVE_TITLE)).toBeNull();
	});

	it("有修改时先提醒，选择「继续编辑」不离开", async () => {
		const { history, router } = renderAt(true);
		await leave(history);
		expect(await screen.findByText(LEAVE_TITLE)).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
		expect(router.state.location.pathname).toBe("/");
	});

	it("有修改时选择「放弃修改」后离开", async () => {
		const { history } = renderAt(true);
		await leave(history);
		fireEvent.click(await screen.findByRole("button", { name: "放弃修改" }));
		expect(await screen.findByText("别的页面")).toBeDefined();
	});

	it("会话过期跳到登录页时不拦截", async () => {
		const { history } = renderAt(true);
		await leave(history, "/login");
		expect(await screen.findByText("登录页面")).toBeDefined();
		expect(screen.queryByText(LEAVE_TITLE)).toBeNull();
	});
});
