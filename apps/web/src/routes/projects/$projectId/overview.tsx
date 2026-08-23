import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { OverviewSkeleton } from "@/components/overview/overview-skeleton";
import {
	OVERVIEW_MAIN,
	OverviewView,
} from "@/components/overview/overview-view";
import type { RouterAppContext } from "@/routes/__root";

/**
 * 六条统计各自 ensureQueryData，一次 Promise.all 并发发出。
 *
 * 写在路由选项字面量外面，与同目录的 index.tsx / route.tsx 同理：TypeScript
 * 才能在检查同一字面量里的其他字段之前推导出 loader 的类型。
 *
 * 刻意不把结果 return 出去：TanStack Start 会把 loader 的返回值序列化进 SSR
 * 载荷，而这五份数据已经随 queryClient 脱水传过去一遍了，return 等于让首屏
 * 多背一份同样的 JSON。卡片一律从 queryClient 里取（useSuspenseQuery），
 * loader 只负责把缓存预热到位。
 *
 * 预热而不是让每张卡自己边挂载边取：卡片用的是 useSuspenseQuery，没预热就会
 * 在挂载时挂起，而这条路由的子树外面没有 Suspense 边界，挂起会一路冒泡到根
 * 布局、把整个外壳变成空白（同 layout/module-panel.tsx 里那段的理由）。
 */
const overviewLoader = async ({
	context,
	params,
}: {
	context: RouterAppContext;
	params: { projectId: string };
}): Promise<void> => {
	const input = { projectId: params.projectId };
	const { orpc, queryClient } = context;
	await Promise.all([
		queryClient.ensureQueryData(
			orpc.projectStats.overview.queryOptions({ input })
		),
		queryClient.ensureQueryData(
			orpc.projectStats.coverage.queryOptions({ input })
		),
		queryClient.ensureQueryData(
			orpc.projectStats.staleHighPriority.queryOptions({ input })
		),
		queryClient.ensureQueryData(
			orpc.projectStats.aiAdoption.queryOptions({ input })
		),
		queryClient.ensureQueryData(
			orpc.projectStats.recentChanges.queryOptions({ input })
		),
	]);
};

export const Route = createFileRoute("/projects/$projectId/overview")({
	component: ProjectOverviewPage,
	loader: overviewLoader,
	/*
	 * loader 要等五条统计里最慢的那条，超过 router.tsx 的 200ms 阈值就得摆加载态。
	 * 不摆就落到兜底的整页 spinner 上——一级侧栏、顶栏、二级面板整块消失，而
	 * defaultPendingMinMs 还保证它至少停 300ms，从侧栏点一下看着像应用闪没了一次。
	 *
	 * 只补 main 这一层：外壳、顶栏、二级面板与 Outlet 容器都由父路由 route.tsx 给出，
	 * pending 渲染在 Outlet 的位置上，再套一层 ProjectShell 就成了两层外壳。
	 */
	pendingComponent: ProjectOverviewPending,
});

/*
 * phase="pending"：pending 与就绪是两个不同的组件类型，路由在两者之间切换必然
 * 卸载重挂，PageTransition 的 key={pathname} 拦不住（key 只在同一组件类型之间
 * 生效），不标注就会播两次进场——骨架淡入一次，数据到达再淡入一次。这一端负责
 * 登记「骨架正摆着」，就绪那一端（overview-view.tsx 的 phase="ready"）据此跳过
 * 自己的进场。
 *
 * className 与就绪态共用同一个导出的 OVERVIEW_MAIN：两份类名迟早各改各的，
 * 而任何一处差异都会在数据到达那一帧变成跳动。
 */
function ProjectOverviewPending() {
	return (
		<PageTransition className={OVERVIEW_MAIN} phase="pending">
			<OverviewSkeleton />
		</PageTransition>
	);
}

function ProjectOverviewPage() {
	const { projectId } = Route.useParams();
	return <OverviewView projectId={projectId} />;
}
