import { Skeleton } from "@automationstack/ui/components/skeleton";

import { ReportFailedCasesCardSkeleton } from "@/components/test-runs/report-failed-cases-card-skeleton";
import { ReportModuleCardSkeleton } from "@/components/test-runs/report-module-card-skeleton";
import { ReportPriorityCardSkeleton } from "@/components/test-runs/report-priority-card-skeleton";
import { ReportResultCardSkeleton } from "@/components/test-runs/report-result-card-skeleton";
import { ReportSummaryCardSkeleton } from "@/components/test-runs/report-summary-card-skeleton";

function HeadingSkeleton() {
	return (
		<div className="flex items-center gap-3 xl:col-span-3">
			<Skeleton className="h-5 w-24" />
			<Skeleton className="h-6 w-48" />
		</div>
	);
}

export function ReportSkeleton() {
	return (
		<>
			<HeadingSkeleton />
			<div className="grid xl:col-span-3">
				<ReportSummaryCardSkeleton />
			</div>
			<div className="grid xl:col-span-2">
				<ReportPriorityCardSkeleton />
			</div>
			<ReportResultCardSkeleton />
			<div className="grid xl:col-span-3">
				<ReportModuleCardSkeleton />
			</div>
			<div className="grid xl:col-span-3">
				<ReportFailedCasesCardSkeleton />
			</div>
		</>
	);
}
