import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import {
	CHANGE_ROW_GRID,
	CHANGES_CARD_CLASS,
} from "@/components/overview/overview-layout";

const ROW_KEYS = ["r1", "r2", "r3", "r4", "r5"] as const;

export function ChangesCardSkeleton() {
	return (
		<CardSkeleton
			className={CHANGES_CARD_CLASS}
			descriptionWidth="w-56"
			titleWidth="w-20"
		>
			<div className="flex flex-col divide-y">
				{ROW_KEYS.map((key) => (
					<div className={CHANGE_ROW_GRID} key={key}>
						<Skeleton className="h-5 w-3/4" />
						<Skeleton className="h-4 w-8" />
						<Skeleton className="h-4 w-2/3" />
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-4 w-28 justify-self-end" />
					</div>
				))}
			</div>
		</CardSkeleton>
	);
}
