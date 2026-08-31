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

/*
 * 导航多久没结束才显示 pending。TanStack 的默认值是 1000ms，对本仓太迟：1 秒内的
 * 导航全程没有任何反馈，点完像是没点动。这里一度砍到 200ms，是往「早给反馈」那头
 * 调过了头——阈值只管「多久之后开始显示」，下面的 PENDING_MIN_MS 还会强制它至少
 * 停满 300ms，于是一次 210ms 就返回的导航（本该是无感的）会被摆上一屏灰板并停满
 * 300ms，硬插一次闪屏，总时长反而从 210ms 拉到 510ms。
 *
 * 回调到 300ms：这一档以下的导航直接出内容，不再有中间态；这一档以上的才值得
 * 花 300ms 的骨架去交代「在等」。配合下面的 defaultPreload: "intent"（悬停 50ms
 * 就开始预取），绝大多数导航根本走不到这个阈值。
 */
const PENDING_DELAY_MS = 300;
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
			{/*
			 * beUI 的 not-found-glitch（shadcn registry 引入，motion 驱动）：数字在
			 * 入场时逐位乱码翻牌再落定，hover 时红/青色差重影。SSR 与首帧直接渲染
			 * 真实 404，乱码是纯客户端增强，prefers-reduced-motion 下自动跳过——
			 * 这些都由组件自己处理，这里只负责中文文案与路由出口。
			 */}
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
		/*
		 * 悬停即预取。下面那行 defaultPreloadStaleTime 本来就是给预加载配套的，
		 * 但它自己不开启任何预取——defaultPreload 默认是 false，缺了这一半等于
		 * 那行配置一直在给一个从没发生过的动作调参。
		 *
		 * 补上之后，鼠标停在链接上 50ms（defaultPreloadDelay 默认值）就开始跑
		 * loader，等真的点下去时数据多半已经在缓存里，导航根本进不了上面
		 * PENDING_DELAY_MS 那 300ms 的阈值，也就不会闪一下骨架——各路由的
		 * pendingComponent 是给冷路径兜底的，不该是常态。
		 *
		 * 取 "intent" 而不是 "viewport"：侧栏和表格里同屏可见的链接动辄几十条，
		 * 进视口就预取会把一整屏的 loader 一次性打出去，为了省几次点击反而把
		 * 首屏之后的带宽占满。
		 */
		defaultPreload: "intent",
		/*
		 * 预取结果的新鲜度一律交给 React Query 自己的 staleTime 判断
		 * （utils/orpc.ts 里那份），不让 router 再加一层各自为政的过期判定。
		 */
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
