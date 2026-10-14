import { Skeleton } from "@automationstack/ui/components/skeleton";

import { BARCODE_BOX_CLASSES } from "@/components/barcode/barcode-box";
import { PRIORITY_VALUES } from "@/components/cases/case-meta";
import { CardSkeleton } from "@/components/overview/card-skeleton";
import {
	NARROW_CARD,
	PRIORITY_GRID,
} from "@/components/overview/overview-layout";

export function PriorityCardSkeleton() {
	return (
		<CardSkeleton
			className={NARROW_CARD}
			descriptionWidth="w-56"
			titleWidth="w-24"
		>
			<div className="flex flex-col gap-3">
				<div className={PRIORITY_GRID}>
					{PRIORITY_VALUES.map((priority) => (
						<div className="contents" key={priority}>
							<Skeleton className="h-5 w-6" />
							<Skeleton className={BARCODE_BOX_CLASSES.sm} />
							<Skeleton className="h-4 w-20" />
						</div>
					))}
				</div>
				<Skeleton className="h-4 w-36" />
			</div>
		</CardSkeleton>
	);
}
