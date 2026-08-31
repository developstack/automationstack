import { Skeleton } from "@automationstack/ui/components/skeleton";

import { DonutSkeleton } from "@/components/skeletons/donut-skeleton";
import { ReportCardSkeleton } from "@/components/test-runs/report-card-skeleton";

/**
 * 结论分布卡的骨架（从 report-skeleton.tsx 拆出来）。
 *
 * 环形图对着 OverviewDonut 的 h-40 w-40 → <DonutSkeleton />（外框同样 size-40）；
 * 其余高度换算表见 report-skeleton.tsx 的头注释，
 * ⚠️ 高度与宽度类名一个字符都不许改。
 */

const LEGEND_ROW_KEYS = ["l1", "l2", "l3", "l4", "l5"] as const;

/** 对齐 ReportResultCard：环形图 + 图例。这是同一行里唯一的单列卡。 */
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
