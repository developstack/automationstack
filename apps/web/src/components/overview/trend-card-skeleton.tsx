import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import {
	NARROW_CARD,
	TREND_CARD_CONTENT,
} from "@/components/overview/overview-layout";

interface TrendCardSkeletonProps {
	/** 卡片上方有没有大数字。 */
	bigNumber: boolean;
	chartBox: string;
}

/** 趋势图卡片（M2、M6、M7）的骨架屏。 */
export function TrendCardSkeleton({
	bigNumber,
	chartBox,
}: TrendCardSkeletonProps) {
	return (
		<CardSkeleton
			className={NARROW_CARD}
			descriptionWidth="w-56 max-w-full"
			titleWidth="w-24"
		>
			<div className={TREND_CARD_CONTENT}>
				{bigNumber ? (
					<div className="flex flex-col gap-1">
						<Skeleton className="h-10 w-24" />
						<Skeleton className="h-4 w-40" />
					</div>
				) : null}
				<Skeleton className={chartBox} />
			</div>
		</CardSkeleton>
	);
}
