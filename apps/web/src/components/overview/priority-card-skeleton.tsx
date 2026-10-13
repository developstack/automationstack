import { Skeleton } from "@automationstack/ui/components/skeleton";

import { PRIORITY_VALUES } from "@/components/cases/case-meta";
import { CardSkeleton } from "@/components/overview/card-skeleton";
import { PRIORITY_GRID } from "@/components/overview/overview-layout";

export function PriorityCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-56" titleWidth="w-24">
			<div className={PRIORITY_GRID}>
				{PRIORITY_VALUES.map((priority) => (
					<div className="contents" key={priority}>
						<Skeleton className="h-5 w-6" />
						<Skeleton className="h-1.5 w-full" />
						<Skeleton className="h-4 w-20" />
					</div>
				))}
			</div>
		</CardSkeleton>
	);
}
