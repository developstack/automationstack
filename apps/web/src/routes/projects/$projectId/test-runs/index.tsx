import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { TestRunListPageSkeleton } from "@/components/test-runs/test-run-list-skeleton";
import {
	TEST_RUN_LIST_MAIN,
	TestRunListView,
} from "@/components/test-runs/test-run-list-view";
import {
	type TestRunsSearch,
	testRunListInput,
	testRunsSearchSchema,
} from "@/components/test-runs/test-runs-search";
import type { RouterAppContext } from "@/routes/__root";

/**
 * 目录式路由（test-runs/index.tsx）而不是 test-runs.tsx：详情页
 * `test-runs/$runId.tsx`（W6）一旦落地，扁平写法会把本文件默默变成布局路由，
 * 列表内容就会跟着详情页一起渲染。
 *
 * 写在路由选项字面量外面，与同目录的 index.tsx 同理：TypeScript 才能在检查
 * 同一字面量里的其他字段之前推导出 loaderDeps 的类型。
 */
const testRunListLoaderDeps = ({ search }: { search: TestRunsSearch }) => ({
	runStatus: search.runStatus,
});

interface TestRunListLoaderData {
	projectName: string;
}

/**
 * 预热列表缓存，另外把项目名带回来给 `head` 用。
 *
 * `projects.get` 这一条父路由（route.tsx）已经取过，这里的 `ensureQueryData`
 * 命中缓存、不产生第二次请求；要的只是把名字拿到这一层——`head` 只能读本路由
 * 自己的 loaderData，够不到父路由的。
 *
 * 列表数据仍然只预热、不 return：那份 JSON 已随 queryClient 脱水进 SSR 载荷，
 * return 会让首屏多背一份同样的东西（同 overview.tsx 的理由）。项目名是个短
 * 字符串，多带这一份换来的是标签页上分得清哪个项目。
 */
const testRunListLoader = async ({
	context,
	deps,
	params,
}: {
	context: RouterAppContext;
	deps: { runStatus: TestRunsSearch["runStatus"] };
	params: { projectId: string };
}): Promise<TestRunListLoaderData> => {
	const [project] = await Promise.all([
		context.queryClient.ensureQueryData(
			context.orpc.projects.get.queryOptions({
				input: { id: params.projectId },
			})
		),
		context.queryClient.ensureQueryData(
			context.orpc.testRuns.list.queryOptions({
				input: testRunListInput(params.projectId, {
					runStatus: deps.runStatus,
				}),
			})
		),
	]);
	return { projectName: project.name };
};

export const Route = createFileRoute("/projects/$projectId/test-runs/")({
	component: TestRunListPage,
	/*
	 * 标签页写「项目名 · 模块名」。模块名而不是记录名，与侧栏那一行的文字一致；
	 * 项目名不能省——同时开着两个项目的测试任务列表时，两个标签页的标题一模一样，
	 * 谁是谁只能靠挨个点开试。父路由 route.tsx 的标题就是这个形状，这里是在它
	 * 中间插一段，不是另起一套。
	 */
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `${loaderData?.projectName ?? "项目"} · 测试评审和执行 · 测试用例平台`,
			},
		],
	}),
	loader: testRunListLoader,
	/*
	 * loaderDeps 取 runStatus 而**不**取 runKeyword。
	 *
	 * 状态筛选是低频动作（一个项目通常也就几十个测试任务），把它算进依赖换来的是
	 * 分享链接进来时首屏直接命中；关键词是逐字敲出来的，即便已经防抖过一次，
	 * 每停手一次都重跑 loader 就意味着整页换成 pendingComponent 闪一下——
	 * 与用例列表页刻意只取 moduleId 是同一条取舍。带关键词的深链首屏会自己去取
	 * 一次（组件里 keepPreviousData 兜着），只是少了预热，不会出错。
	 */
	loaderDeps: testRunListLoaderDeps,
	pendingComponent: TestRunListPending,
	validateSearch: testRunsSearchSchema,
});

/*
 * 只补 main 这一层：外壳、顶栏、二级面板与 Outlet 容器都由父路由 route.tsx 给出。
 * phase="pending" 与就绪态的 phase="ready" 配对，避免骨架淡入一次、数据到达再
 * 淡入一次（详见 routes/projects/$projectId/index.tsx 里那段注释）。
 * 类名共用同一个 TEST_RUN_LIST_MAIN，两处差一点就会在数据到达那一帧跳动。
 *
 * 用 TestRunListPageSkeleton 而不是 TestRunListSkeleton：后者只画表格，这一层
 * 连工具栏和表头上方那段说明都还没有，只画表格会让数据到达时整张表往上跳 72px
 * （折算过程见 test-run-list-skeleton.tsx）。
 */
function TestRunListPending() {
	return (
		<PageTransition className={TEST_RUN_LIST_MAIN} phase="pending">
			<TestRunListPageSkeleton />
		</PageTransition>
	);
}

function TestRunListPage() {
	const { projectId } = Route.useParams();
	return <TestRunListView projectId={projectId} />;
}
