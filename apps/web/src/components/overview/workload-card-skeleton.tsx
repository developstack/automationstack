import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { WIDE_CARD } from "@/components/overview/overview-layout";

const ROW_KEYS = ["r1", "r2", "r3", "r4"] as const;

/** 与 WorkloadMemberTable 的行相同：头像和用户名，两列条码和数字。 */
export function WorkloadCardSkeleton() {
	return (
		<CardSkeleton
			className={WIDE_CARD}
			descriptionWidth="w-64 max-w-full"
			titleWidth="w-32"
		>
			<div className="flex flex-col gap-3">
				{ROW_KEYS.map((row) => (
					<div className="flex items-center gap-4" key={row}>
						<div className="flex w-36 shrink-0 items-center gap-2">
							<Skeleton className="size-7 rounded-full" />
							<Skeleton className="h-4 w-16" />
						</div>
						<Skeleton className="h-5 flex-1 rounded-sm" />
						<Skeleton className="h-5 flex-1 rounded-sm" />
					</div>
				))}
			</div>
		</CardSkeleton>
	);
}
