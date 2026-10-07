import { Skeleton } from "@automationstack/ui/components/skeleton";

import { DonutSkeleton } from "@/components/skeletons/donut-skeleton";
import { ReportCardSkeleton } from "@/components/test-runs/report-card-skeleton";

const LEGEND_ROW_KEYS = ["l1", "l2", "l3", "l4", "l5"] as const;

export function ReportResultCardSkeleton() {
	return (
		<ReportCardSkeleton descriptionWidth="w-56" titleWidth="w-20">
			<DonutSkeleton />
			<div className="flex flex-col gap-1.5">
				{LEGEND_ROW_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
		</ReportCardSkeleton>
	);
}
