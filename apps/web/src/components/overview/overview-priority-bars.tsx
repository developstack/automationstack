import { lazy, Suspense } from "react";

import { OVERVIEW_BARS_BOX } from "@/components/overview/chart-box";
import type { OverviewPriorityBarsProps } from "@/components/overview/overview-priority-bars-chart";

const LazyOverviewPriorityBarsChart = lazy(async () => {
	const chartModule = await import(
		"@/components/overview/overview-priority-bars-chart"
	);
	return { default: chartModule.OverviewPriorityBarsChart };
});

const BARS_FALLBACK = <div aria-hidden="true" className={OVERVIEW_BARS_BOX} />;

export function OverviewPriorityBars(props: OverviewPriorityBarsProps) {
	return (
		<Suspense fallback={BARS_FALLBACK}>
			<LazyOverviewPriorityBarsChart {...props} />
		</Suspense>
	);
}
