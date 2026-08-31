/**
 * 用例列表的就绪态主体：表格 + 分页条。
 *
 * 从 case-list-view.tsx 拆出来，那边只留下工具栏装配与查询。
 */
import type { TestCase } from "@automationstack/db/schema/test-cases";

import { CasePagination } from "@/components/cases/case-pagination";
import { CaseTable } from "@/components/cases/case-table";
import type { WorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";

interface CaseListResultProps {
	filtered: boolean;
	navigation: WorkspaceNavigation;
	result: { items: TestCase[]; page: number; total: number };
	selectedCaseId: string | undefined;
	/** 当前展示的是上一次查询留下的结果，新数据还在路上。 */
	stale: boolean;
}

/** Table plus paginator; only rendered once the first page has loaded. */
export function CaseListResult(props: CaseListResultProps) {
	const { navigation, result } = props;
	return (
		<>
			<CaseTable
				cases={result.items}
				filtered={props.filtered}
				onClearFilters={navigation.clearFilters}
				selectedCaseId={props.selectedCaseId}
				stale={props.stale}
			/>
			<CasePagination
				onPageChange={navigation.setPage}
				page={result.page}
				total={result.total}
			/>
		</>
	);
}
