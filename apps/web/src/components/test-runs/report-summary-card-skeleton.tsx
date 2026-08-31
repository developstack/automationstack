import { Skeleton } from "@automationstack/ui/components/skeleton";

import { ReportCardSkeleton } from "@/components/test-runs/report-card-skeleton";

/**
 * 报告概览卡的骨架（从 report-skeleton.tsx 拆出来）。
 *
 * 高度换算表见 report-skeleton.tsx 的头注释，那里的数值与就绪态严丝合缝，
 * ⚠️ 搬动时高度与宽度类名一个字符都不许改。
 */

const SUMMARY_STAT_KEYS = ["total", "passed", "failed", "blocked"] as const;
const RATE_KEYS = ["completion", "pass"] as const;

/** 一行大读数：标签(h-5) + 数字(h-9) + 口径注脚(h-4)，与 ReportStat 逐行对齐。 */
function StatSkeleton() {
	return (
		<div className="flex flex-col gap-0.5">
			<Skeleton className="h-5 w-16" />
			<Skeleton className="h-9 w-20" />
			<Skeleton className="h-4 w-full" />
		</div>
	);
}

/** 对齐 ReportSummaryCard：四个计数读数 + 分隔线 + 两个比率读数。 */
export function ReportSummaryCardSkeleton() {
	return (
		<ReportCardSkeleton descriptionWidth="w-96" titleWidth="w-24">
			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				{SUMMARY_STAT_KEYS.map((key) => (
					<StatSkeleton key={key} />
				))}
			</div>
			<Skeleton className="h-px w-full" />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{RATE_KEYS.map((key) => (
					<StatSkeleton key={key} />
				))}
			</div>
		</ReportCardSkeleton>
	);
}
