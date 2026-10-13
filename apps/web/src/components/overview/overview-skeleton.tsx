import { PageHeader } from "@/components/layout/page-header";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { ChangesCardSkeleton } from "@/components/overview/changes-card-skeleton";
import { CoverageCardSkeleton } from "@/components/overview/coverage-card-skeleton";
import { OVERVIEW_SIDE_COLUMN } from "@/components/overview/overview-layout";
import { PriorityCardSkeleton } from "@/components/overview/priority-card-skeleton";
import { StaleCardSkeleton } from "@/components/overview/stale-card-skeleton";
import { StatusCardSkeleton } from "@/components/overview/status-card-skeleton";

const SUMMARY_PLACEHOLDER = (
	<span
		aria-hidden="true"
		className="inline-block h-4 w-80 max-w-full rounded-md bg-accent-foreground/10 align-middle motion-safe:animate-pulse"
	/>
);

export function OverviewSkeleton() {
	return (
		<>
			<output aria-busy="true" className="sr-only">
				项目概览加载中
			</output>
			<PageHeader
				className="col-span-full"
				summary={SUMMARY_PLACEHOLDER}
				title={WORKSPACE_VIEW_LABELS.overview}
			/>
			<StatusCardSkeleton />
			<CoverageCardSkeleton />
			<div aria-hidden="true" className={OVERVIEW_SIDE_COLUMN}>
				<PriorityCardSkeleton />
				<StaleCardSkeleton />
			</div>
			<ChangesCardSkeleton />
		</>
	);
}
