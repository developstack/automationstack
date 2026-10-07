import { lazy, Suspense } from "react";

import { DONUT_BOX } from "@/components/overview/chart-box";
import type { OverviewDonutProps } from "@/components/overview/overview-donut-chart";

export type { DonutSlice } from "@/components/overview/overview-donut-chart";

const LazyOverviewDonutChart = lazy(async () => {
	const chartModule = await import(
		"@/components/overview/overview-donut-chart"
	);
	return { default: chartModule.OverviewDonutChart };
});

const DONUT_FALLBACK = <div aria-hidden="true" className={DONUT_BOX} />;

export function OverviewDonut(props: OverviewDonutProps) {
	return (
		<Suspense fallback={DONUT_FALLBACK}>
			<LazyOverviewDonutChart {...props} />
		</Suspense>
	);
}
