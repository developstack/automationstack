import { PageHeaderSkeleton } from "@/components/layout/page-header-skeleton";
import { ReportFailedAndBlockedCasesCardSkeleton } from "@/components/test-runs/report-failed-and-blocked-cases-card-skeleton";
import { ReportModuleCardSkeleton } from "@/components/test-runs/report-module-card-skeleton";
import { ReportPriorityCardSkeleton } from "@/components/test-runs/report-priority-card-skeleton";
import { ReportResultCardSkeleton } from "@/components/test-runs/report-result-card-skeleton";
import { ReportSummaryCardSkeleton } from "@/components/test-runs/report-summary-card-skeleton";

export function ReportSkeleton() {
	return (
		<>
			<PageHeaderSkeleton className="xl:col-span-3" />
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
				<ReportFailedAndBlockedCasesCardSkeleton />
			</div>
		</>
	);
}
