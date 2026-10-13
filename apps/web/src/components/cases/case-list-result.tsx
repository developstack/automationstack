import type { TestCase } from "@automationstack/db/schema/test-cases";
import type { UseQueryResult } from "@tanstack/react-query";

import { CaseListError } from "@/components/cases/case-list-error";
import { CaseListFooter } from "@/components/cases/case-list-footer";
import { CaseTable } from "@/components/cases/case-table";
import { CaseTableEmpty } from "@/components/cases/case-table-empty";
import { CASE_LIST_PANEL_CLASS } from "@/components/cases/case-table-layout";
import { CaseTableSkeleton } from "@/components/cases/case-table-skeleton";
import type { WorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";

export interface CaseListPage {
	items: TestCase[];
	page: number;
	total: number;
}

type CaseListQuery = Pick<
	UseQueryResult<CaseListPage>,
	"data" | "error" | "isError" | "isFetching" | "isPlaceholderData" | "refetch"
>;

interface CaseListResultProps {
	canCreate: boolean;
	filtered: boolean;
	navigation: WorkspaceNavigation;
	query: CaseListQuery;
	selectedCaseId: string | undefined;
}

function CaseListBody({
	canCreate,
	filtered,
	navigation,
	query,
	selectedCaseId,
}: CaseListResultProps) {
	const { data } = query;
	if (data === undefined) {
		return query.isError ? (
			<CaseListError query={query} />
		) : (
			<CaseTableSkeleton />
		);
	}
	if (data.items.length === 0) {
		return (
			<CaseTableEmpty
				canCreate={canCreate}
				filtered={filtered}
				onClearFilters={navigation.clearFilters}
				onCreate={navigation.openCreate}
			/>
		);
	}
	return (
		<>
			<CaseTable
				cases={data.items}
				selectedCaseId={selectedCaseId}
				stale={query.isPlaceholderData}
			/>
			<CaseListFooter
				onPageChange={navigation.setPage}
				page={data.page}
				stale={query.isPlaceholderData}
				total={data.total}
			/>
		</>
	);
}

/**
 * 用例列表的卡片面板。改筛选条件和翻页时面板和表格留在原位：
 * 旧结果一直显示到新结果到达，然后只有新出现的行淡入。
 */
export function CaseListResult(props: CaseListResultProps) {
	return (
		<section aria-label="用例" className={CASE_LIST_PANEL_CLASS}>
			<CaseListBody {...props} />
		</section>
	);
}
