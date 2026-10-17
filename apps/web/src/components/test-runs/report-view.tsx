import { useSuspenseQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { StatusBadge } from "@/components/status/status-badge";
import { ReportAutomationCard } from "@/components/test-runs/report-automation-card";
import { ReportFailedAndBlockedCasesCard } from "@/components/test-runs/report-failed-and-blocked-cases-card";
import type { TestRunReportView } from "@/components/test-runs/report-meta";
import { ReportModuleCard } from "@/components/test-runs/report-module-card";
import { ReportOutOfScopeCard } from "@/components/test-runs/report-out-of-scope-card";
import { ReportPriorityCard } from "@/components/test-runs/report-priority-card";
import { ReportResultCard } from "@/components/test-runs/report-result-card";
import { ReportSubmitBar } from "@/components/test-runs/report-submit-bar";
import { ReportSummaryCard } from "@/components/test-runs/report-summary-card";
import { runPermissions } from "@/components/test-runs/test-run-meta";
import { orpc } from "@/utils/orpc";

export const REPORT_MAIN =
	"grid min-h-0 auto-rows-min grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-3";

const FULL_WIDTH = "xl:col-span-3";

const FULL_WIDTH_ROW = "grid xl:col-span-3";
const WIDE_COLUMN = "grid xl:col-span-2";

interface ReportViewProps {
	projectId: string;
	runId: string;
}

function hasSubmitBar(report: TestRunReportView): boolean {
	return report.run.submittedAt !== null || report.run.status === "completed";
}

export function ReportView({ projectId, runId }: ReportViewProps) {
	const { data: report } = useSuspenseQuery(
		orpc.testRuns.report.queryOptions({ input: { runId } })
	);

	return (
		<PageTransition className={REPORT_MAIN} phase="ready">
			<PageHeader
				badge={<StatusBadge kind="runStatus" value={report.run.status} />}
				className={FULL_WIDTH}
				title={report.run.name}
			/>

			{hasSubmitBar(report) ? (
				<div className={FULL_WIDTH_ROW}>
					<ReportSubmitBar report={report} />
				</div>
			) : null}

			<div className={FULL_WIDTH_ROW}>
				<ReportSummaryCard report={report} />
			</div>

			<div className={WIDE_COLUMN}>
				<ReportPriorityCard priorities={report.priorities} />
			</div>
			<ReportResultCard report={report} />

			<div className={FULL_WIDTH_ROW}>
				<ReportModuleCard modules={report.modules} />
			</div>

			<div className={FULL_WIDTH_ROW}>
				<ReportFailedAndBlockedCasesCard
					cases={report.failedAndBlockedCases}
					counts={report.counts}
				/>
			</div>

			<ReportAutomationCard
				className={FULL_WIDTH}
				executions={report.automationExecutions}
			/>
			<ReportOutOfScopeCard
				cases={report.outOfScopeCases}
				className={FULL_WIDTH}
				locked={runPermissions(report.run.status).locked}
				projectId={projectId}
				runId={runId}
			/>
		</PageTransition>
	);
}
