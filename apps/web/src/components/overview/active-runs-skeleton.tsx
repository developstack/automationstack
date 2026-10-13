import { Skeleton } from "@automationstack/ui/components/skeleton";

import { BARCODE_BOX_CLASSES } from "@/components/barcode/barcode-box";
import { CardSkeleton } from "@/components/overview/card-skeleton";
import { FULL_CARD, RUN_ROW_GRID } from "@/components/overview/overview-layout";

const ROW_KEYS = ["r1", "r2", "r3"] as const;

export function ActiveRunsSkeleton() {
	return (
		<CardSkeleton
			action={<Skeleton className="h-8 w-20" />}
			className={FULL_CARD}
			descriptionWidth="w-72 max-w-full"
			titleWidth="w-36"
		>
			<div className="flex flex-col gap-2">
				<div className="divide-y">
					{ROW_KEYS.map((key) => (
						<div className={RUN_ROW_GRID} key={key}>
							<Skeleton className="h-5 w-3/4" />
							<Skeleton className={BARCODE_BOX_CLASSES.sm} />
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-4 w-32" />
						</div>
					))}
				</div>
				<Skeleton className="h-4 w-40" />
			</div>
		</CardSkeleton>
	);
}
