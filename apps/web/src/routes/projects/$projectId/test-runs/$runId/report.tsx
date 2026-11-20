import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { reportLoader } from "@/components/test-runs/report-loader";
import { ReportSkeleton } from "@/components/test-runs/report-skeleton";
import { REPORT_MAIN, ReportView } from "@/components/test-runs/report-view";
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
