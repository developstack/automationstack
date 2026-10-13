import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { OverviewChangesCard } from "@/components/overview/overview-changes-card";
import { OverviewCoverageCard } from "@/components/overview/overview-coverage-card";
import { OverviewPriorityCard } from "@/components/overview/overview-priority-card";
import { OverviewStaleCard } from "@/components/overview/overview-stale-card";
import { OverviewTotalsCard } from "@/components/overview/overview-totals-card";

export const OVERVIEW_MAIN =
	"grid min-h-0 auto-rows-min grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2 xl:grid-cols-3";

interface OverviewViewProps {
	projectId: string;
}

export function OverviewView({ projectId }: OverviewViewProps) {
	return (
		<PageTransition className={OVERVIEW_MAIN} phase="ready">
			<PageHeader
				className="col-span-full"
				title={WORKSPACE_VIEW_LABELS.overview}
			/>
			<OverviewTotalsCard projectId={projectId} />
			<OverviewPriorityCard projectId={projectId} />
			<OverviewCoverageCard projectId={projectId} />
			<OverviewStaleCard projectId={projectId} />
			<OverviewChangesCard projectId={projectId} />
		</PageTransition>
	);
}
