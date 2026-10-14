import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { OVERVIEW_MAIN } from "@/components/overview/overview-layout";
import { OverviewSkeleton } from "@/components/overview/overview-skeleton";
import { OverviewView } from "@/components/overview/overview-view";
import type { RouterAppContext } from "@/routes/__root";

// prefetchQuery 不抛出错误：一个区域的数据加载失败时，只有那个区域显示重试，其他区域照常显示
const overviewLoader = async ({
	context,
	params,
}: {
	context: RouterAppContext;
	params: { projectId: string };
}): Promise<void> => {
	const input = { projectId: params.projectId };
	const { orpc, queryClient } = context;
	const stats = orpc.projectStats;
	await Promise.all([
		queryClient.prefetchQuery(stats.overview.queryOptions({ input })),
		queryClient.prefetchQuery(stats.caseTrend.queryOptions({ input })),
		queryClient.prefetchQuery(stats.executionCoverage.queryOptions({ input })),
		queryClient.prefetchQuery(stats.activeRuns.queryOptions({ input })),
		queryClient.prefetchQuery(stats.latestResults.queryOptions({ input })),
		queryClient.prefetchQuery(stats.executionTrend.queryOptions({ input })),
		queryClient.prefetchQuery(stats.runTrend.queryOptions({ input })),
		queryClient.prefetchQuery(stats.coverage.queryOptions({ input })),
	]);
};

export const Route = createFileRoute("/projects/$projectId/overview")({
	component: ProjectOverviewPage,
	loader: overviewLoader,
	pendingComponent: ProjectOverviewPending,
});

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
