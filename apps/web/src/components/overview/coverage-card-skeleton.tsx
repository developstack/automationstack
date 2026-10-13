import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { COVERAGE_CARD_CLASS } from "@/components/overview/overview-layout";

const ROW_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6"] as const;

export function CoverageCardSkeleton() {
	return (
		<CardSkeleton
			className={COVERAGE_CARD_CLASS}
			descriptionWidth="w-80 max-w-full"
			titleWidth="w-28"
		>
			<Skeleton className="h-4 w-40" />
			<div className="flex flex-col gap-3">
				{ROW_KEYS.map((key) => (
					<div className="flex flex-col gap-1.5" key={key}>
						<Skeleton className="h-5 w-full" />
						<Skeleton className="h-2 w-3/4" />
					</div>
				))}
			</div>
		</CardSkeleton>
	);
}
