import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { ReportSkeleton } from "@/components/test-runs/report-skeleton";
import { REPORT_MAIN, ReportView } from "@/components/test-runs/report-view";
import type { RouterAppContext } from "@/routes/__root";

interface ReportLoaderData {
	projectName: string;
}

const reportLoader = async ({
	context,
	params,
}: {
	context: RouterAppContext;
	params: { projectId: string; runId: string };
}): Promise<ReportLoaderData> => {
	const [project] = await Promise.all([
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
	return { projectName: project.name };
};

export const Route = createFileRoute(
	"/projects/$projectId/test-runs/$runId/report"
)({
	component: TestRunReportPage,
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `${loaderData?.projectName ?? "项目"} · 测试任务报告 · 测试用例平台`,
			},
		],
	}),
	loader: reportLoader,
	pendingComponent: TestRunReportPending,
});

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
