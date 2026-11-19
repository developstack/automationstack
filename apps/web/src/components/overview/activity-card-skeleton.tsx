import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { FULL_CARD } from "@/components/overview/overview-layout";

const ENTRY_KEYS = ["e1", "e2", "e3", "e4", "e5"] as const;

export function ActivityCardSkeleton() {
	return (
		<CardSkeleton
			className={FULL_CARD}
			descriptionWidth="w-64 max-w-full"
			titleWidth="w-24"
		>
			<div className="flex flex-col gap-3">
				{ENTRY_KEYS.map((key) => (
					<div className="flex flex-col gap-1.5" key={key}>
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-3 w-1/2" />
					</div>
				))}
			</div>
		</CardSkeleton>
	);
}
