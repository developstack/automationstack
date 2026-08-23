import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import {
	createRouter as createTanStackRouter,
	Link,
} from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { FileQuestionIcon } from "lucide-react";
import { useEffect } from "react";

import { PageTransition } from "./components/layout/page-transition";
import { RouteError } from "./components/layout/route-error";
import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";
import { createQueryClient, orpc } from "./utils/orpc";

const NOT_FOUND_TITLE = "页面不存在 · 测试用例平台";

/*
 * 导航多久没结束才显示 pending（默认 1000ms 太迟：1 秒内的导航全程没有任何反馈，
 * 点完像是没点动）。200ms 是「还算即时」与「已经开始等」的分界：低于它人感知不到
 * 延迟，摆个加载态反而是多余的一次闪动。
 */
const PENDING_DELAY_MS = 200;
/*
 * pending 一旦显示就至少停留这么久（默认 500ms 偏长）。缺了它，恰好在阈值附近
 * 返回的导航会让骨架亮一帧就消失——那种闪烁比全程不显示更糟。300ms 是能被看成
 * 「出现过」的最短时长，同时把最坏情况下多等的时间压在半秒以内。
 */
const PENDING_MIN_MS = 300;

/**
 * 404 页：给出标题、main 地标和一个回项目列表的出口。
 * 标题只能用副作用写：defaultNotFoundComponent 不是路由，拿不到 head 选项。
 */
function NotFoundPage() {
	useEffect(() => {
		document.title = NOT_FOUND_TITLE;
	}, []);

	return (
		<PageTransition className="container mx-auto flex max-w-5xl items-center px-4 py-6">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<FileQuestionIcon />
					</EmptyMedia>
					<EmptyTitle>
						<h1>页面不存在</h1>
					</EmptyTitle>
					<EmptyDescription>链接可能已失效或被删除。</EmptyDescription>
					<Link className="text-sm underline underline-offset-4" to="/projects">
						返回项目列表
					</Link>
				</EmptyHeader>
			</Empty>
		</PageTransition>
	);
}

export const getRouter = () => {
	const queryClient = createQueryClient();

	const router = createTanStackRouter({
		context: { orpc, queryClient },
		/*
		 * 兜底的错误边界：自己没写 errorComponent 的路由都落到它。缺了它的话，
		 * loader 抛错或 useSuspenseQuery 失败会一路冒到 React 根部，
		 * 把侧栏、顶栏连同主内容一起卸载成白页。
		 */
		defaultErrorComponent: RouteError,
		defaultNotFoundComponent: NotFoundPage,
		/*
		 * 兜底的整页 spinner：只有自己没写 pendingComponent 的路由才会用到它。
		 * /projects、/members 等有骨架屏的路由各自的 pendingComponent 优先级更高，
		 * 不会被它顶掉。
		 */
		defaultPendingComponent: () => <Loader />,
		defaultPendingMinMs: PENDING_MIN_MS,
		defaultPendingMs: PENDING_DELAY_MS,
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
