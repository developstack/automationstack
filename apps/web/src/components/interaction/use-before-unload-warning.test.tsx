import {
	createBrowserHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useBeforeUnloadWarning } from "@/components/interaction/use-before-unload-warning";

function FormPage({ dirty }: { dirty: boolean }) {
	useBeforeUnloadWarning(dirty);
	return <p>表单页面</p>;
}

async function renderPage(dirty: boolean) {
	const rootRoute = createRootRoute({ component: Outlet });
	const formRoute = createRoute({
		component: () => <FormPage dirty={dirty} />,
		getParentRoute: () => rootRoute,
		path: "/",
	});
	const otherRoute = createRoute({
		component: () => <p>别的页面</p>,
		getParentRoute: () => rootRoute,
		path: "/other",
	});
	const history = createBrowserHistory();
	const router = createRouter({
		history,
		routeTree: rootRoute.addChildren([formRoute, otherRoute]),
	});
	render(<RouterProvider router={router} />);
	await screen.findByText("表单页面");
	return { history, router };
}

function unloadIsBlocked(): boolean {
	const event = new Event("beforeunload", { cancelable: true });
	window.dispatchEvent(event);
	return event.defaultPrevented;
}

afterEach(() => {
	window.history.replaceState(null, "", "/");
});

describe("useBeforeUnloadWarning：有未保存的修改时，关闭或刷新标签页由浏览器提醒", () => {
	it("有修改时，浏览器关闭标签页前会提醒", async () => {
		await renderPage(true);
		expect(unloadIsBlocked()).toBe(true);
	});

	it("没有修改时不提醒", async () => {
		await renderPage(false);
		expect(unloadIsBlocked()).toBe(false);
	});

	it("站内跳转不拦截，由面板自己的关闭提醒处理", async () => {
		const { history } = await renderPage(true);
		act(() => history.push("/other"));
		expect(await screen.findByText("别的页面")).toBeDefined();
	});
});
