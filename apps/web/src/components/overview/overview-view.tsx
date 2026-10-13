import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { OverviewChangesCard } from "@/components/overview/overview-changes-card";
import { OverviewCoverageCard } from "@/components/overview/overview-coverage-card";
import {
	OVERVIEW_MAIN,
	OVERVIEW_SIDE_COLUMN,
} from "@/components/overview/overview-layout";
import { overviewSummary } from "@/components/overview/overview-metrics";
import { OverviewPriorityCard } from "@/components/overview/overview-priority-card";
import { OverviewStaleCard } from "@/components/overview/overview-stale-card";
import { OverviewStatusCard } from "@/components/overview/overview-status-card";
import { orpc } from "@/utils/orpc";

function useOverviewSummary(projectId: string): string | undefined {
	const input = { projectId };
	const overview = useQuery(orpc.projectStats.overview.queryOptions({ input }));
	const stale = useQuery(
		orpc.projectStats.staleHighPriority.queryOptions({ input })
	);
	if (overview.data === undefined || stale.data === undefined) {
		return undefined;
	}
	return overviewSummary({
		staleTotal: stale.data.total,
		thresholdDays: stale.data.thresholdDays,
		totalCases: overview.data.totalCases,
	});
}

interface OverviewViewProps {
	projectId: string;
}

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
			<OverviewCoverageCard projectId={projectId} />
			<div className={OVERVIEW_SIDE_COLUMN}>
				<OverviewPriorityCard projectId={projectId} />
				<OverviewStaleCard projectId={projectId} />
			</div>
			<OverviewChangesCard projectId={projectId} />
		</PageTransition>
	);
}
