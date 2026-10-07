import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";

const PRIORITY_KEYS = ["p0", "p1", "p2", "p3"] as const;

export function PriorityCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-56" titleWidth="w-24">
			<div className="flex h-32 flex-col justify-around">
				{PRIORITY_KEYS.map((key) => (
					<div className="flex items-center gap-1" key={key}>
						<Skeleton className="h-4 w-6" />
						<Skeleton className="h-4 flex-1" />
					</div>
				))}
			</div>
			<div className="flex flex-wrap gap-x-3 gap-y-2">
				{PRIORITY_KEYS.map((key) => (
					<Skeleton className="h-5 w-20" key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}
