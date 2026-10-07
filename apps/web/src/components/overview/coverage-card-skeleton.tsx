import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { DonutSkeleton } from "@/components/skeletons/donut-skeleton";

const GAP_ROW_KEYS = ["covered", "no-active", "empty"] as const;
const GAP_SAMPLE_KEYS = ["g1", "g2", "g3", "g4", "g5"] as const;

export function CoverageCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-64" titleWidth="w-28">
			<DonutSkeleton />
			<div className="flex flex-col gap-1.5">
				{GAP_ROW_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
			<div className="flex flex-col gap-1.5 border-t pt-3">
				{GAP_SAMPLE_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}
