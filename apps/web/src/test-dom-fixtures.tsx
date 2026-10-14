import {
	QueryClient,
	QueryClientProvider,
	type QueryKey,
} from "@tanstack/react-query";
import {
	createBrowserHistory,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	type RouteComponent,
	RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";

/** 组件测试共用的辅助函数。只给 *.test.tsx 使用。 */

interface TestRoutes {
	/** 起始地址。不给时使用浏览器历史，地址是 jsdom 当前的地址。 */
	initialPath?: string;
	/** 根路由的组件，默认只有 Outlet。 */
	layout?: RouteComponent;
	/** 路径和页面组件。 */
	routes: Record<string, RouteComponent>;
}

/** 用 TanStack Router 渲染几个页面，返回 history 和 router。 */
export function renderRoutes({
	initialPath,
	layout = Outlet,
	routes,
}: TestRoutes) {
	const rootRoute = createRootRoute({ component: layout });
	const children = Object.entries(routes).map(([path, component]) =>
		createRoute({ component, getParentRoute: () => rootRoute, path })
	);
	const history =
		initialPath === undefined
			? createBrowserHistory()
			: createMemoryHistory({ initialEntries: [initialPath] });
	const router = createRouter({
		history,
		routeTree: rootRoute.addChildren(children),
	});
	render(<RouterProvider router={router} />);
	return { history, router };
}

/** 新的 QueryClient（失败不重试）的包装组件。seed 中的每一项先写入缓存。 */
export function createQueryWrapper(...seed: [QueryKey, unknown][]) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	for (const [queryKey, data] of seed) {
		queryClient.setQueryData(queryKey, data);
	}
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

/** 在新的 QueryClient 中渲染 ui。 */
export function renderWithQuery(ui: ReactNode, ...seed: [QueryKey, unknown][]) {
	return render(ui, { wrapper: createQueryWrapper(...seed) });
}

/** jsdom 没有 matchMedia；SidebarProvider 用它判断窄屏。这里总是宽屏。 */
export function stubMatchMedia() {
	vi.stubGlobal("matchMedia", (query: string) => ({
		addEventListener: () => undefined,
		matches: false,
		media: query,
		removeEventListener: () => undefined,
	}));
}

/** a 在文档顺序中位于 b 之前。 */
export function isBefore(a: Element, b: Element): boolean {
	const ordered = [...document.querySelectorAll("*")];
	return ordered.indexOf(a) < ordered.indexOf(b);
}
