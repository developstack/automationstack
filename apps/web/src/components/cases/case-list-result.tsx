import type { TestCase } from "@automationstack/db/schema/test-cases";
import type { UseQueryResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { CaseListBatchActions } from "@/components/cases/case-list-batch-actions";
import { CaseListError } from "@/components/cases/case-list-error";
import { CaseListFooter } from "@/components/cases/case-list-footer";
import { CaseTable } from "@/components/cases/case-table";
import { CaseTableEmpty } from "@/components/cases/case-table-empty";
import { CASE_LIST_PANEL_CLASS } from "@/components/cases/case-table-layout";
import { CaseTableSkeleton } from "@/components/cases/case-table-skeleton";
import type { CaseSelection } from "@/components/cases/use-case-selection";
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
	/** 勾选的用例。有勾选时表格上方出现批量操作栏。 */
	selection: CaseSelection;
}

interface CaseListBodyProps extends CaseListResultProps {
	/** 面板已经显示过内容。之后才出现的表格，所有行都淡入。 */
	panelShown: boolean;
}

function CaseListBody({
	canCreate,
	filtered,
	navigation,
	panelShown,
	query,
	selectedCaseId,
	selection,
}: CaseListBodyProps) {
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
			<CaseListBatchActions selection={selection} />
			<CaseTable
				animateFirst={panelShown}
				cases={data.items}
				selectedCaseId={selectedCaseId}
				selection={selection}
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
 * 表格在空状态、出错或骨架屏之后出现时，所有行淡入。
 */
export function CaseListResult(props: CaseListResultProps) {
	const [panelShown, setPanelShown] = useState(false);
	useEffect(() => setPanelShown(true), []);
	return (
		<section aria-label="用例" className={CASE_LIST_PANEL_CLASS}>
			<CaseListBody {...props} panelShown={panelShown} />
		</section>
	);
}
