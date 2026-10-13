import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { WIDE_CARD } from "@/components/overview/overview-layout";

const ROW_KEYS = ["m1", "m2", "m3", "m4"] as const;

export function CoverageCardSkeleton() {
	return (
		<CardSkeleton
			action={<Skeleton className="h-9 w-12" />}
			className={WIDE_CARD}
			descriptionWidth="w-80 max-w-full"
			titleWidth="w-28"
		>
			<div className="flex flex-col divide-y">
				{ROW_KEYS.map((key) => (
					<div className="flex items-center gap-2 py-2" key={key}>
						<Skeleton className="h-5 flex-1" />
						<Skeleton className="h-5 w-20" />
						<Skeleton className="h-4 w-12" />
					</div>
				))}
			</div>
		</CardSkeleton>
	);
}
