import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { reportLoader } from "@/components/test-runs/report-loader";
import { ReportSkeleton } from "@/components/test-runs/report-skeleton";
import { REPORT_MAIN, ReportView } from "@/components/test-runs/report-view";

/* 从测试报告列表打开的报告。内容与测试任务下的报告页相同，侧栏和路径显示「测试报告」。 */
export const Route = createFileRoute("/projects/$projectId/reports/$runId")({
	component: SubmittedReportPage,
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `${loaderData?.projectName ?? "项目"} · 测试报告 · 测试用例平台`,
			},
		],
	}),
	loader: reportLoader,
	pendingComponent: SubmittedReportPending,
});

function SubmittedReportPending() {
	return (
		<PageTransition className={REPORT_MAIN} phase="pending">
			<ReportSkeleton />
		</PageTransition>
	);
}

function SubmittedReportPage() {
	const { projectId, runId } = Route.useParams();
	return <ReportView projectId={projectId} runId={runId} />;
}
