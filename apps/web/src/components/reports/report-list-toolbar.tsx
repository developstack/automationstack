import type { ReportSubmitter } from "@automationstack/db/repositories/test-run-report-list-repository";

import { ReportDateFilter } from "@/components/reports/report-date-filter";
import { ReportSubmitterFilter } from "@/components/reports/report-submitter-filter";
import type { ReportsSearch } from "@/components/reports/reports-search";
import type { useReportListFilters } from "@/components/reports/use-report-list-filters";
import { KeywordFilter } from "@/components/test-runs/keyword-filter";

interface ReportListToolbarProps {
	filters: ReturnType<typeof useReportListFilters>;
	search: ReportsSearch;
	submitters: readonly ReportSubmitter[];
}

export function ReportListToolbar({
	filters,
	search,
	submitters,
}: ReportListToolbarProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<KeywordFilter
				keyword={search.kw ?? ""}
				label="搜索测试报告名称"
				onChange={filters.setKeyword}
			/>
			<ReportSubmitterFilter
				onChange={filters.setSubmitter}
				submitter={search.submitter}
				submitters={submitters}
			/>
			<ReportDateFilter
				from={search.from}
				onFromChange={filters.setFrom}
				onToChange={filters.setTo}
				to={search.to}
			/>
		</div>
	);
}
