import { Skeleton } from "@automationstack/ui/components/skeleton";

import { ReportCardSkeleton } from "@/components/test-runs/report-card-skeleton";

const SUMMARY_STAT_KEYS = ["total", "passed", "failed", "blocked"] as const;
const RATE_KEYS = ["completion", "pass"] as const;

function StatSkeleton() {
	return (
		<div className="flex flex-col gap-0.5">
			<Skeleton className="h-5 w-16" />
			<Skeleton className="h-9 w-20" />
			<Skeleton className="h-4 w-full" />
		</div>
	);
}

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
