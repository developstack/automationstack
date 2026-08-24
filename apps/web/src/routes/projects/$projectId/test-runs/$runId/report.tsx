import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { ReportSkeleton } from "@/components/test-runs/report-skeleton";
import { REPORT_MAIN, ReportView } from "@/components/test-runs/report-view";
import type { RouterAppContext } from "@/routes/__root";

interface ReportLoaderData {
	projectName: string;
}

/**
 * 页面数据只预热 `testRuns.report` 这一条（另一条 `projects.get` 是父路由已经
 * 取过的，命中缓存，只为把项目名拿到这一层给 `head` 用）。
 *
 * 它已经是一次聚合查询——四个计数、两个率、模块/优先级分档、失败清单、
 * 自动提交日期全在里面（见 packages/db 的 test-run-report-repository.ts），
 * 页面上没有第二条要等的数据。
 *
 * 写在路由选项字面量外面，与同目录上层的 route.tsx / overview.tsx 同理：
 * TypeScript 才能在检查同一字面量里的其他字段之前推导出 loader 的类型。
 *
 * 刻意不 return 报告本身：TanStack Start 会把 loader 的返回值序列化进 SSR 载荷，
 * 而这份数据已经随 queryClient 脱水传过去一遍了，return 等于让首屏多背一份同样的 JSON。
 * 唯一带回去的是项目名那个短字符串，`head` 要用。
 * 页面从 queryClient 里取（useSuspenseQuery），loader 只负责把缓存预热到位——
 * 没预热的话那个 useSuspenseQuery 会在挂载时挂起，而这条路由的子树外面没有
 * Suspense 边界，挂起会一路冒泡到根布局、把整个外壳变成空白。
 */
const reportLoader = async ({
	context,
	params,
}: {
	context: RouterAppContext;
	params: { projectId: string; runId: string };
}): Promise<ReportLoaderData> => {
	const [project] = await Promise.all([
		// 父路由 route.tsx 已经取过，这里命中缓存、不产生第二次请求。
		context.queryClient.ensureQueryData(
			context.orpc.projects.get.queryOptions({
				input: { id: params.projectId },
			})
		),
		context.queryClient.ensureQueryData(
			context.orpc.testRuns.report.queryOptions({
				input: { runId: params.runId },
			})
		),
	]);
	// 唯一 return 出去的是项目名——head 只能读本路由自己的 loaderData，够不到父路由。
	return { projectName: project.name };
};

export const Route = createFileRoute(
	"/projects/$projectId/test-runs/$runId/report"
)({
	component: TestRunReportPage,
	/*
	 * 标题带项目名：并排开着两份报告时，光看「测试任务报告 · 测试用例平台」
	 * 两个标签页一模一样。形状沿用父路由 route.tsx 的那一份。
	 */
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `${loaderData?.projectName ?? "项目"} · 测试任务报告 · 测试用例平台`,
			},
		],
	}),
	loader: reportLoader,
	/*
	 * loader 要等一次跨多表的聚合查询，超过 router.tsx 的 200ms 阈值就得摆加载态。
	 * 不摆就落到兜底的整页 spinner 上——一级侧栏、顶栏、二级面板整块消失，而
	 * defaultPendingMinMs 还保证它至少停 300ms，从列表点进来看着像应用闪没了一次。
	 *
	 * 只补 main 这一层：外壳由 projects/$projectId/route.tsx 给出，
	 * pending 渲染在 Outlet 的位置上，再套一层 ProjectShell 就成了两层外壳。
	 */
	pendingComponent: TestRunReportPending,
});

/*
 * phase="pending"：pending 与就绪是两个不同的组件类型，路由在两者之间切换必然
 * 卸载重挂，PageTransition 的 key={pathname} 拦不住，不标注就会播两次进场。
 * className 与就绪态共用导出的 REPORT_MAIN——两份类名迟早各改各的，
 * 而任何一处差异都会在数据到达那一帧变成跳动。
 */
function TestRunReportPending() {
	return (
		<PageTransition className={REPORT_MAIN} phase="pending">
			<ReportSkeleton />
		</PageTransition>
	);
}

function TestRunReportPage() {
	const { projectId, runId } = Route.useParams();
	return <ReportView projectId={projectId} runId={runId} />;
}
