import { NotFoundGlitch } from "@automationstack/ui/components/motion/not-found/glitch";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { useEffect } from "react";

import { PageTransition } from "./components/layout/page-transition";
import { RouteError } from "./components/layout/route-error";
import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";
import { createQueryClient, orpc } from "./utils/orpc";

const NOT_FOUND_TITLE = "页面不存在 · 测试用例平台";

const PENDING_DELAY_MS = 300;
const PENDING_MIN_MS = 300;

function NotFoundPage() {
	useEffect(() => {
		document.title = NOT_FOUND_TITLE;
	}, []);

	return (
		<PageTransition className="container mx-auto flex max-w-5xl items-center px-4 py-6">
			<NotFoundGlitch
				description="链接可能已失效或被删除。"
				homeHref="/projects"
				homeLabel="返回项目列表"
				title="页面不存在"
			/>
		</PageTransition>
	);
}

export const getRouter = () => {
	const queryClient = createQueryClient();

	const router = createTanStackRouter({
		context: { orpc, queryClient },
		defaultErrorComponent: RouteError,
		defaultNotFoundComponent: NotFoundPage,
		defaultPendingComponent: () => <Loader />,
		defaultPendingMinMs: PENDING_MIN_MS,
		defaultPendingMs: PENDING_DELAY_MS,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		routeTree,
		scrollRestoration: true,
	});

	setupRouterSsrQueryIntegration({
		queryClient,
		router,
	});

	return router;
};

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
