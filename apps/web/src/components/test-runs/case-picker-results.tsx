import type { TestCase } from "@automationstack/db/schema/test-cases";

import { CaseFilters } from "@/components/cases/case-filters";
import { CasePagination } from "@/components/cases/case-pagination";
import type {
	CasePickerSelection,
	PickerFilterState,
} from "@/components/test-runs/case-picker-state";
import { CasePickerTable } from "@/components/test-runs/case-picker-table";
import { CasePickerTableSkeleton } from "@/components/test-runs/case-picker-table-skeleton";

interface CasePickerResultsProps {
	cases: TestCase[];
	filterState: PickerFilterState;
	hasData: boolean;
	projectId: string;
	selectedIds: ReadonlySet<string>;
	selection: CasePickerSelection;
	total: number;
}

export function CasePickerResults({
	cases,
	filterState,
	hasData,
	projectId,
	selectedIds,
	selection,
	total,
}: CasePickerResultsProps) {
	const { filters } = filterState;

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
			<CaseFilters
				keyword={filters.kw}
				onKeywordChange={filterState.setKeyword}
				onPriorityChange={filterState.setPriority}
				onStatusChange={filterState.setStatus}
				onTagsChange={filterState.setTags}
				priority={filters.priority}
				projectId={projectId}
				status={filters.status}
				tags={filters.tags}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{hasData ? (
					<CasePickerTable
						cases={cases}
						onToggle={selection.toggleOne}
						onTogglePage={selection.togglePage}
						pageState={selection.pageState}
						selectedIds={selectedIds}
					/>
				) : (
					<CasePickerTableSkeleton />
				)}
			</div>
			<CasePagination
				onPageChange={filterState.setPage}
				page={filters.page}
				total={total}
			/>
		</div>
	);
}
