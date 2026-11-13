import { buttonVariants } from "@automationstack/ui/components/button";
import { Toaster } from "@automationstack/ui/components/sonner";
import { TooltipProvider } from "@automationstack/ui/components/tooltip";
import { cn } from "@automationstack/ui/lib/utils";
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

import { sessionQueryOptions } from "@/components/auth/use-session";
import { useSessionGate } from "@/components/auth/use-session-gate";
import Loader from "@/components/loader";
import {
	THEME_INIT_SCRIPT,
	useThemeAppearance,
} from "@/components/theme/use-theme";
import type { orpc } from "@/utils/orpc";
import {
	CHANGE_PASSWORD_PATHNAME,
	isChangePasswordPathname,
} from "@/utils/password-change";
import { isLoginPathname, LOGIN_PATHNAME } from "@/utils/session-expiry";

import appCss from "../index.css?url";
export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	beforeLoad: async ({ context, location }) => {
		const user = await context.queryClient.ensureQueryData(
			sessionQueryOptions()
		);
		if (user === null && !isLoginPathname(location.pathname)) {
			throw redirect({
				search: { redirect: location.href },
				to: LOGIN_PATHNAME,
			});
		}
		if (
			user?.mustChangePassword === true &&
			!isChangePasswordPathname(location.pathname)
		) {
			throw redirect({ replace: true, to: CHANGE_PASSWORD_PATHNAME });
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

function AppContent() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const gate = useSessionGate();

	if (isLoginPathname(pathname)) {
		return <Outlet />;
	}

	if (gate === "waiting") {
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
		<html lang="zh-CN" suppressHydrationWarning>
			<head>
				<ScriptOnce>{THEME_INIT_SCRIPT}</ScriptOnce>
				<HeadContent />
			</head>
			<body>
				<a
					className={cn(
						buttonVariants({ variant: "outline" }),
						"skip-link top-2 left-2 z-50 bg-background px-3 py-2 shadow-lg focus:ring-2 focus:ring-ring"
					)}
					href="#main"
				>
					跳到主要内容
				</a>
				<TooltipProvider>
					<AppContent />
				</TooltipProvider>
				<Toaster richColors theme={appearance} />
				<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
				<Scripts />
			</body>
		</html>
	);
}
