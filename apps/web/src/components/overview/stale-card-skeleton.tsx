import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";

const ROW_KEYS = ["r1", "r2", "r3", "r4"] as const;

export function StaleCardSkeleton() {
	return (
		<CardSkeleton
			action={<Skeleton className="h-9 w-10" />}
			descriptionWidth="w-72 max-w-full"
			titleWidth="w-32"
		>
			<div className="flex flex-col gap-2">
				{ROW_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}
