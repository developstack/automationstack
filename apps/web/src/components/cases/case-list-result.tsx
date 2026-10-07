import type { TestCase } from "@automationstack/db/schema/test-cases";

import { CasePagination } from "@/components/cases/case-pagination";
import { CaseTable } from "@/components/cases/case-table";
import type { WorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";

interface CaseListResultProps {
	filtered: boolean;
	navigation: WorkspaceNavigation;
	result: { items: TestCase[]; page: number; total: number };
	selectedCaseId: string | undefined;
	stale: boolean;
}

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
