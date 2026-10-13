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
	await Promise.all([
		queryClient.prefetchQuery(
			orpc.projectStats.overview.queryOptions({ input })
		),
		queryClient.prefetchQuery(
			orpc.projectStats.coverage.queryOptions({ input })
		),
		queryClient.prefetchQuery(
			orpc.projectStats.staleHighPriority.queryOptions({ input })
		),
		queryClient.prefetchQuery(
			orpc.projectStats.recentChanges.queryOptions({ input })
		),
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
