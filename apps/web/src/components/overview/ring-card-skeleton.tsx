import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { DONUT_BOX } from "@/components/overview/chart-box";
import {
	NARROW_CARD,
	RING_CARD_CONTENT,
} from "@/components/overview/overview-layout";

const LEGEND_KEYS = ["l1", "l2", "l3", "l4"] as const;

interface RingCardSkeletonProps {
	/** 图例的行数，与最终的图例相同。 */
	legendRows: number;
}

/** 圆环图和环形进度图卡片（M1、M4、M5）的骨架屏。 */
export function RingCardSkeleton({ legendRows }: RingCardSkeletonProps) {
	return (
		<CardSkeleton
			className={NARROW_CARD}
			descriptionWidth="w-48 max-w-full"
			titleWidth="w-24"
		>
			<div className={RING_CARD_CONTENT}>
				<Skeleton className={cn(DONUT_BOX, "rounded-full")} />
				<div className="flex w-full flex-col gap-1.5">
					{LEGEND_KEYS.slice(0, legendRows).map((key) => (
						<Skeleton className="h-5 w-full" key={key} />
					))}
				</div>
				<Skeleton className="h-4 w-40" />
			</div>
		</CardSkeleton>
	);
}
