import { Skeleton } from "@automationstack/ui/components/skeleton";
import { useEffect } from "react";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { CoverageCardSkeleton } from "@/components/overview/coverage-card-skeleton";
import { PriorityCardSkeleton } from "@/components/overview/priority-card-skeleton";
import { TotalsCardSkeleton } from "@/components/overview/totals-card-skeleton";

let chartChunkRequested = false;

function preloadChartChunks() {
	if (chartChunkRequested) {
		return;
	}
	chartChunkRequested = true;
	Promise.all([
		import("@/components/overview/overview-donut-chart"),
		import("@/components/overview/overview-priority-bars-chart"),
	]).catch(() => {
		chartChunkRequested = false;
	});
}

const LIST_ROW_KEYS = ["r1", "r2", "r3", "r4"] as const;

function StaleCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-64" titleWidth="w-32">
			<Skeleton className="h-9 w-12" />
			<div className="flex flex-col gap-1.5">
				{LIST_ROW_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}

function ChangesCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-56" titleWidth="w-20">
			<div className="flex flex-col gap-2">
				{LIST_ROW_KEYS.map((key) => (
					<div className="flex flex-col gap-0.5" key={key}>
						<Skeleton className="h-5 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				))}
			</div>
		</CardSkeleton>
	);
}

export function OverviewSkeleton() {
	useEffect(() => preloadChartChunks(), []);

	return (
		<>
			<output aria-busy="true" className="sr-only">
				项目概览加载中
			</output>
			<TotalsCardSkeleton />
			<PriorityCardSkeleton />
			<CoverageCardSkeleton />
			<StaleCardSkeleton />
			<ChangesCardSkeleton />
		</>
	);
}
