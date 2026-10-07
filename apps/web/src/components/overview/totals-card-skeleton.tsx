import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { DonutSkeleton } from "@/components/skeletons/donut-skeleton";

const STATUS_ROW_KEYS = ["active", "draft", "deprecated"] as const;

export function TotalsCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-48" titleWidth="w-20">
			<DonutSkeleton />
			<div className="flex flex-col gap-1.5">
				{STATUS_ROW_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}
