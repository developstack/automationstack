import { REPORT_PAGE_SIZE } from "@automationstack/db/repositories/test-run-report-list-core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";

import { CasePagination } from "@/components/cases/case-pagination";
import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { ReportListEmpty } from "@/components/reports/report-list-empty";
import { ReportListToolbar } from "@/components/reports/report-list-toolbar";
import { ReportTable } from "@/components/reports/report-table";
import {
	isFilteredReportSearch,
	reportListInput,
} from "@/components/reports/reports-search";
import { useReportListFilters } from "@/components/reports/use-report-list-filters";
import { orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/projects/$projectId/reports/");

export const REPORT_LIST_MAIN =
	"flex min-h-0 flex-col gap-3 overflow-y-auto p-4";

const NO_SUBMITTERS = [] as const;

/** 已提交的测试报告列表：按名称、提交人和提交日期筛选，每页 20 份。 */
export function ReportListView({ projectId }: { projectId: string }) {
	const search = routeApi.useSearch();
	const navigate = useNavigate({ from: "/projects/$projectId/reports/" });
	const filters = useReportListFilters(navigate);
	const query = useQuery(
		orpc.testRuns.submittedReports.queryOptions({
			input: reportListInput(projectId, search),
			placeholderData: keepPreviousData,
		})
	);
	const { data } = query;

	return (
		<PageTransition className={REPORT_LIST_MAIN} phase="ready">
			<PageHeader title={WORKSPACE_VIEW_LABELS.reports} />
			<ReportListToolbar
				filters={filters}
				search={search}
				submitters={data?.submitters ?? NO_SUBMITTERS}
			/>
			{data === undefined ? null : (
				<>
					{data.items.length === 0 ? (
						<ReportListEmpty
							filtered={isFilteredReportSearch(search) || data.total > 0}
						/>
					) : (
						<ReportTable items={data.items} />
					)}
					<div className="flex items-center justify-between gap-2">
						<p
							aria-busy={query.isPlaceholderData}
							className="text-muted-foreground text-xs"
							role="status"
						>
							共 <span className="numeric text-foreground">{data.total}</span>{" "}
							份
						</p>
						<CasePagination
							label="测试报告分页"
							onPageChange={filters.setPage}
							page={data.page}
							pageSize={REPORT_PAGE_SIZE}
							total={data.total}
						/>
					</div>
				</>
			)}
		</PageTransition>
	);
}
