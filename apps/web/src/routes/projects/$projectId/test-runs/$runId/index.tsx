/**
 * 测试任务详情 = 执行台（plan §7.3）。
 *
 * 文件放在 `test-runs/$runId/index.tsx` 而不是 `test-runs/$runId.tsx`：
 * 报告页是 `test-runs/$runId/report.tsx`，用扁平写法的话这一份就成了报告页的
 * 父布局，必须再画一个 `<Outlet />`，否则报告页整页空白。目录 + index 的
 * URL 与扁平写法完全一致，且与本仓库既有路由（`projects/$projectId/index.tsx`）同构。
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { PageTransition } from "@/components/layout/page-transition";
import { RunExecutionView } from "@/components/test-runs/run-execution-view";
import type { RouterAppContext } from "@/routes/__root";

/**
 * 选中的用例行写进 URL：刷新、后退、把链接发给同事都能停在同一条上。
 * 用 `runCaseId`（执行行）而不是 `caseId`（用例）——同一条用例可以出现在
 * 多个测试任务里，只有执行行 id 才唯一标识「这个测试任务里的这一条」。
 */
const runDetailSearchSchema = z.object({
	runCaseId: z.string().optional(),
});

/* lg 起才 h-full：这一层的父节点是 projects/$projectId/route.tsx 里那个
   `absolute inset-0 overflow-y-auto` 的滚动容器，它的高度被 grid-rows-header-body
   的 body 行锁死，h-full 就是吃满它。
   但只有 main 吃满还不够：高度要一路传到两栏区，run-execution-layout.tsx 的根 div
   必须同样在 lg 起 flex-1 把这段高度接下去，内部 min-h-0 / flex-1 / overflow-y-auto
   的链路才真的有剩余空间可分，变更历史才钉在视口底部而不是拽出一大片空白。两处的
   断点必须同进同退，改一处就得改另一处。
   <lg 的堆叠布局每行自适应内容、由外层滚动容器整体滚，本就没有 stretch 空白，加
   h-full 反而会让两行内容溢出被裁，所以只在 lg 起。 */
/* lg:overflow-hidden —— 这一页在 lg 下自己就是满高的，绝不能再产生整页滚动：
   一旦内部有一处横向顶破（比如某一栏缺 min-w-0），外层那个 absolute inset-0
   overflow-y-auto 会先长出横滚条、吃掉约 15px 高度，原本刚好铺满的那一摞随即
   差这一点，竖滚条跟着冒出来——用户看到的就是「突然多了个全局滚动，还能往下多滚
   一截」。在这一页的 main 上把溢出关掉，这条路径从根上不成立；滚动只发生在
   右栏与左侧清单各自的 overflow-y-auto 里。
   只在 lg 起：<lg 是堆叠布局，本来就靠外层滚动容器整体滚，关掉会把内容裁掉。 */
const EXECUTION_MAIN = "flex min-h-0 flex-col lg:h-full lg:overflow-hidden";

interface RunDetailLoaderData {
	projectName: string;
}

/**
 * 预热执行台要的那条 `testRuns.get`，另外把项目名带回来给 `head` 用。
 *
 * `projects.get` 父路由（route.tsx）已经取过，这里命中缓存、不产生第二次请求；
 * 要的只是把名字拿到这一层——`head` 只能读本路由自己的 loaderData。
 *
 * 只 return 项目名，不 return 整份 run：loader 的返回值会被序列化进 SSR 载荷，
 * 而 run 那一份已经随 queryClient 脱水传过去一遍了。
 */
const runDetailLoader = async ({
	context,
	params,
}: {
	context: RouterAppContext;
	params: { projectId: string; runId: string };
}): Promise<RunDetailLoaderData> => {
	const [project] = await Promise.all([
		context.queryClient.ensureQueryData(
			context.orpc.projects.get.queryOptions({
				input: { id: params.projectId },
			})
		),
		context.queryClient.ensureQueryData(
			context.orpc.testRuns.get.queryOptions({ input: { runId: params.runId } })
		),
	]);
	return { projectName: project.name };
};

export const Route = createFileRoute("/projects/$projectId/test-runs/$runId/")({
	component: RunExecutionPage,
	/*
	 * 标题里必须有项目名：并排开着两个项目的执行台时，光看「测试任务 · 测试用例平台」
	 * 两个标签页一模一样，只能挨个点开试。形状与父路由 route.tsx 的标题一致，
	 * 中间插一段模块用词而已。
	 *
	 * 这里用记录用词「测试任务」而不是模块名——这一页看的是某一个具体的测试任务。
	 */
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `${loaderData?.projectName ?? "项目"} · 测试任务 · 测试用例平台`,
			},
		],
	}),
	loader: runDetailLoader,
	pendingComponent: RunExecutionPending,
	validateSearch: runDetailSearchSchema,
});

/*
 * loaderDeps 不取 search：换选中用例只该改右栏，重跑 loader 会把整页换成骨架。
 * 与用例列表页同一条取舍（见 projects/$projectId/index.tsx 的长注释）。
 */
function RunExecutionPending() {
	return (
		<PageTransition className={EXECUTION_MAIN} phase="pending">
			<p className="p-8 text-center text-muted-foreground text-sm">
				正在载入测试任务…
			</p>
		</PageTransition>
	);
}

function RunExecutionPage() {
	const { projectId, runId } = Route.useParams();
	const { runCaseId } = Route.useSearch();
	const navigate = Route.useNavigate();

	const handleSelectRunCase = useCallback(
		(nextId: string | undefined) => {
			// replace: true —— 逐条打结论会连续换选中项，不 replace 的话
			// 浏览器的「后退」要按几十次才能真的离开这一页。
			navigate({ replace: true, search: { runCaseId: nextId } });
		},
		[navigate]
	);

	return (
		<PageTransition className={EXECUTION_MAIN} phase="ready">
			<RunExecutionView
				onSelectRunCase={handleSelectRunCase}
				projectId={projectId}
				runId={runId}
				selectedRunCaseId={runCaseId}
			/>
		</PageTransition>
	);
}
