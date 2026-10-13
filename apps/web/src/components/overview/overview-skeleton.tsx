import { CONCLUDED_RESULTS } from "@automationstack/db/repositories/project-stats-definitions";

import { PageHeader } from "@/components/layout/page-header";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { ActiveRunsSkeleton } from "@/components/overview/active-runs-skeleton";
import { CoverageCardSkeleton } from "@/components/overview/coverage-card-skeleton";
import {
	STACKED_CHART_BOX,
	TREND_CHART_BOX,
	TREND_PAIR,
} from "@/components/overview/overview-layout";
import { PriorityCardSkeleton } from "@/components/overview/priority-card-skeleton";
import { RingCardSkeleton } from "@/components/overview/ring-card-skeleton";
import { TrendCardSkeleton } from "@/components/overview/trend-card-skeleton";
import { UnexecutedCardSkeleton } from "@/components/overview/unexecuted-card-skeleton";

const SUMMARY_PLACEHOLDER = (
	<span
		aria-hidden="true"
		className="inline-block h-4 w-96 max-w-full rounded-md bg-accent-foreground/10 align-middle motion-safe:animate-pulse"
	/>
);

const CASE_STATUS_COUNT = 3;
const COVERAGE_RING_COUNT = 2;

/** 整个页面的骨架屏，区域顺序和布局与 OverviewView 相同。 */
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
			<RingCardSkeleton legendRows={CASE_STATUS_COUNT} />
			<TrendCardSkeleton bigNumber chartBox={TREND_CHART_BOX} />
			<RingCardSkeleton legendRows={COVERAGE_RING_COUNT} />
			<ActiveRunsSkeleton />
			<UnexecutedCardSkeleton />
			<RingCardSkeleton legendRows={CONCLUDED_RESULTS.length} />
			<div aria-hidden="true" className={TREND_PAIR}>
				<TrendCardSkeleton bigNumber={false} chartBox={STACKED_CHART_BOX} />
				<TrendCardSkeleton bigNumber chartBox={STACKED_CHART_BOX} />
			</div>
			<CoverageCardSkeleton />
			<PriorityCardSkeleton />
		</>
	);
}
