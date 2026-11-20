import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { ReportListPageSkeleton } from "@/components/reports/report-list-page-skeleton";
import {
	REPORT_LIST_MAIN,
	ReportListView,
} from "@/components/reports/report-list-view";
import {
	type ReportsSearch,
	reportListInput,
	reportsSearchSchema,
} from "@/components/reports/reports-search";
import type { RouterAppContext } from "@/routes/__root";

interface ReportListLoaderData {
	projectName: string;
}

const reportListLoader = async ({
	context,
	deps,
	params,
}: {
	context: RouterAppContext;
	deps: { search: ReportsSearch };
	params: { projectId: string };
}): Promise<ReportListLoaderData> => {
	const [project] = await Promise.all([
		context.queryClient.ensureQueryData(
			context.orpc.projects.get.queryOptions({
				input: { id: params.projectId },
			})
		),
		context.queryClient.ensureQueryData(
			context.orpc.testRuns.submittedReports.queryOptions({
				input: reportListInput(params.projectId, deps.search),
			})
		),
	]);
	return { projectName: project.name };
};

export const Route = createFileRoute("/projects/$projectId/reports/")({
	component: ReportListPage,
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `${loaderData?.projectName ?? "项目"} · 测试报告 · 测试用例平台`,
			},
		],
	}),
	loader: reportListLoader,
	loaderDeps: ({ search }) => ({ search }),
	pendingComponent: ReportListPending,
	validateSearch: reportsSearchSchema,
});

function ReportListPending() {
	return (
		<PageTransition className={REPORT_LIST_MAIN} phase="pending">
			<ReportListPageSkeleton />
		</PageTransition>
	);
}

function ReportListPage() {
	const { projectId } = Route.useParams();
	return <ReportListView projectId={projectId} />;
}
