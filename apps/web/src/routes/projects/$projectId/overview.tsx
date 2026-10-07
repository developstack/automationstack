import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { OverviewSkeleton } from "@/components/overview/overview-skeleton";
import {
	OVERVIEW_MAIN,
	OverviewView,
} from "@/components/overview/overview-view";
import type { RouterAppContext } from "@/routes/__root";

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
