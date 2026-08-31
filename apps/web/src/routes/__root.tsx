import { Toaster } from "@automationstack/ui/components/sonner";
import { TooltipProvider } from "@automationstack/ui/components/tooltip";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	redirect,
	ScriptOnce,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { sessionQueryOptions, useSession } from "@/components/auth/use-session";
import Loader from "@/components/loader";
import {
	THEME_INIT_SCRIPT,
	useThemeAppearance,
} from "@/components/theme/use-theme";
import type { orpc } from "@/utils/orpc";

import appCss from "../index.css?url";
export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

const LOGIN_PATHNAME = "/login";

/*
 * 登录页的判断散落在闸门和外壳两处，写死两份字符串迟早会漂移；
 * 路由器给出的 pathname 可能带尾斜杠，两种写法指的是同一个页面。
 */
function isLoginPathname(pathname: string): boolean {
	return pathname === LOGIN_PATHNAME || pathname === `${LOGIN_PATHNAME}/`;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	/*
	 * 登录闸门放在根上而不是逐个路由上：新加的路由默认就受保护，
	 * 漏写一处不会变成一个谁都进得去的页面。
	 */
	beforeLoad: async ({ context, location }) => {
		const user = await context.queryClient.ensureQueryData(
			sessionQueryOptions()
		);
		// 登录页自己也走根 beforeLoad，不放行它会自己重定向到自己
		if (user === null && !isLoginPathname(location.pathname)) {
			throw redirect({
				search: { redirect: location.href },
				to: LOGIN_PATHNAME,
			});
		}
	},
	component: RootDocument,
	head: () => ({
		links: [
			{
				href: appCss,
				rel: "stylesheet",
			},
		],
		meta: [
			{
				charSet: "utf-8",
			},
			{
				content: "width=device-width, initial-scale=1",
				name: "viewport",
			},
			{
				title: "测试用例平台",
			},
		],
	}),
});

/**
 * 根布局不再套任何外壳：平台层的两页（/projects、/users）各自套 AppShell +
 * PlatformSidebar，项目内的页面在 AppShell 之上再套 ProjectShell，登录页则本来
 * 就是一个自带满屏布局的页面。
 * 这里只留登录闸门之后、会话尚未回填那几帧的占位。
 */
function AppContent() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const { user } = useSession();

	// 按路由而不是按会话数据来判断：登录页是唯一一个不需要会话的页面
	if (isLoginPathname(pathname)) {
		return <Outlet />;
	}

	/*
	 * 走到这里的 null 不代表未登录——真未登录早被根 beforeLoad 重定向走了，
	 * 它只出现在登录成功后清空查询缓存、会话还没回填的那一两帧。
	 * 这几帧若直接渲染 <Outlet />，已经切过去的页面（裸页顶栏的用户菜单、
	 * 项目页侧栏的用户区）会调到 useCurrentUser 而它拿不到用户，直接抛出去
	 * 整页崩掉，所以宁可先占位。
	 */
	if (user === null) {
		return (
			<div className="grid min-h-svh place-items-center" role="status">
				<Loader />
				<span className="sr-only">正在加载</span>
			</div>
		);
	}

	return <Outlet />;
}

function RootDocument() {
	const appearance = useThemeAppearance();

	return (
		/*
		 * 界面文案全为简体中文，lang 必须跟着改，否则读屏会用英文发音朗读。
		 * class 由 <head> 里的同步脚本在首帧前写上，服务端渲染时 <html> 上没有它，
		 * 所以要 suppressHydrationWarning——这一处不一致是刻意的。
		 */
		<html lang="zh-CN" suppressHydrationWarning>
			<head>
				{/* 必须排在样式表和内容之前：晚一步就会先按 :root 的亮色画出一帧 */}
				<ScriptOnce>{THEME_INIT_SCRIPT}</ScriptOnce>
				<HeadContent />
			</head>
			<body>
				{/*
				 * 全站第一个可聚焦元素：模块树 + 筛选条 + 用例名按钮加起来，
				 * 从页首 Tab 到分页控件要 60 次以上，且每次路由内切换都要重穿一遍。
				 */}
				<a
					className="skip-link top-2 left-2 z-50 rounded-md border bg-background px-3 py-2 font-medium text-foreground text-sm shadow-lg focus:ring-2 focus:ring-ring"
					href="#main"
				>
					跳到主要内容
				</a>
				{/*
				 * Tooltip 的 Provider 挂在根上。它不渲染任何 DOM，只提供一份共享的
				 * 开合延时上下文（同组里开过一个之后，划到相邻元素立刻开第二个）。
				 * 挂在这里之后，任何用到 tooltip 的组件都不必自己再包一层——漏包不是
				 * 掉个样式那么轻：Base UI 缺 Provider 祖先会直接抛，而这个错只在
				 * 鼠标划过那一刻才爆出来，最容易漏测。
				 * Toaster / devtools / Scripts 留在外面：它们不含 tooltip，包进去只是白搭一层。
				 */}
				<TooltipProvider>
					{/*
					 * 满视口高度与内部滚动由各页自己给：走 AppShell 的页面是它里面
					 * SidebarInset 的 h-svh。根这一层不再派发，否则登录页那种自带满屏
					 * 布局的页面会被套上第二层高度。
					 */}
					<AppContent />
				</TooltipProvider>
				{/* 主题由应用解析后传进去：sonner 自己的 "system" 只看系统偏好，会漏掉显式选择 */}
				<Toaster richColors theme={appearance} />
				{/*
				 * 不能放 top-right：那是每个 Sheet/Dialog 关闭按钮的固定位置
				 * （absolute top-3 right-2.5），徽标会把 X 完全盖住。
				 * 左下角在主题切换按钮移进页面 chrome 后已空出，还给 devtools。
				 */}
				<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
				<Scripts />
			</body>
		</html>
	);
}
