import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { WIDE_CARD } from "@/components/overview/overview-layout";

const PANEL_KEYS = ["executed", "created"] as const;
const ROW_KEYS = ["r1", "r2", "r3", "r4"] as const;

export function WorkloadCardSkeleton() {
	return (
		<CardSkeleton
			className={WIDE_CARD}
			descriptionWidth="w-96 max-w-full"
			titleWidth="w-32"
		>
			<div className="grid gap-6 md:grid-cols-2">
				{PANEL_KEYS.map((panel) => (
					<div className="flex flex-col gap-2" key={panel}>
						<Skeleton className="h-4 w-12" />
						{ROW_KEYS.map((row) => (
							<Skeleton className="h-4 w-full" key={row} />
						))}
					</div>
				))}
			</div>
		</CardSkeleton>
	);
}
