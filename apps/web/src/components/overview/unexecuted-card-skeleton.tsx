import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { WIDE_CARD } from "@/components/overview/overview-layout";

const BAR_KEYS = ["b1", "b2", "b3", "b4"] as const;
const CASE_KEYS = ["c1", "c2", "c3"] as const;

export function UnexecutedCardSkeleton() {
	return (
		<CardSkeleton
			className={WIDE_CARD}
			descriptionWidth="w-72 max-w-full"
			titleWidth="w-40"
		>
			<div className="grid gap-6 md:grid-cols-2">
				<div className="flex flex-col gap-3">
					{BAR_KEYS.map((key) => (
						<Skeleton className="h-4 w-full" key={key} />
					))}
				</div>
				<div className="flex flex-col gap-2">
					<Skeleton className="h-4 w-48" />
					{CASE_KEYS.map((key) => (
						<Skeleton className="h-5 w-full" key={key} />
					))}
				</div>
			</div>
		</CardSkeleton>
	);
}
