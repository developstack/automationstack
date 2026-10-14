import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { OverviewActiveRunsCard } from "@/components/overview/overview-active-runs-card";
import { OverviewCaseTrendCard } from "@/components/overview/overview-case-trend-card";
import { OverviewCoverageCard } from "@/components/overview/overview-coverage-card";
import { OverviewCoverageRateCard } from "@/components/overview/overview-coverage-rate-card";
import { OverviewExecutionTrendCard } from "@/components/overview/overview-execution-trend-card";
import { OverviewLatestResultsCard } from "@/components/overview/overview-latest-results-card";
import {
	OVERVIEW_MAIN,
	TREND_PAIR,
} from "@/components/overview/overview-layout";
import { overviewSummary } from "@/components/overview/overview-metrics";
import { OverviewPriorityCard } from "@/components/overview/overview-priority-card";
import { OverviewRunTrendCard } from "@/components/overview/overview-run-trend-card";
import { OverviewStatusCard } from "@/components/overview/overview-status-card";
import { OverviewUnexecutedCard } from "@/components/overview/overview-unexecuted-card";
import { orpc } from "@/utils/orpc";

/** 标题下的数据概要使用 3 个查询。任何一个还没有数据时不显示概要。 */
function useOverviewSummary(projectId: string): string | undefined {
	const input = { projectId };
	const overview = useQuery(orpc.projectStats.overview.queryOptions({ input }));
	const coverage = useQuery(
		orpc.projectStats.executionCoverage.queryOptions({ input })
	);
	const runs = useQuery(orpc.projectStats.activeRuns.queryOptions({ input }));
	if (
		overview.data === undefined ||
		coverage.data === undefined ||
		runs.data === undefined
	) {
		return undefined;
	}
	return overviewSummary({
		activeCount: coverage.data.activeCount,
		activeRunCount: runs.data.totalCount,
		executedCount: coverage.data.executedCount,
		stalledRunCount: runs.data.stalledCount,
		totalCases: overview.data.totalCases,
	});
}

interface OverviewViewProps {
	projectId: string;
}

/** 区域顺序按调研报告第 9.2 节：按重要性从上到下、从左到右。 */
export function OverviewView({ projectId }: OverviewViewProps) {
	const summary = useOverviewSummary(projectId);

	return (
		<PageTransition className={OVERVIEW_MAIN} phase="ready">
			<PageHeader
				className="col-span-full"
				summary={summary}
				title={WORKSPACE_VIEW_LABELS.overview}
			/>
			<OverviewStatusCard projectId={projectId} />
			<OverviewCaseTrendCard projectId={projectId} />
			<OverviewCoverageRateCard projectId={projectId} />
			<OverviewActiveRunsCard projectId={projectId} />
			<OverviewUnexecutedCard projectId={projectId} />
			<OverviewLatestResultsCard projectId={projectId} />
			<div className={TREND_PAIR}>
				<OverviewExecutionTrendCard projectId={projectId} />
				<OverviewRunTrendCard projectId={projectId} />
			</div>
			<OverviewCoverageCard projectId={projectId} />
			<OverviewPriorityCard projectId={projectId} />
		</PageTransition>
	);
}
