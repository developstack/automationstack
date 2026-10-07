import { useMemo } from "react";

import { CasePickerModules } from "@/components/test-runs/case-picker-modules";
import { CasePickerResults } from "@/components/test-runs/case-picker-results";
import {
	useCasePickerCases,
	useCasePickerSelection,
	usePickerFilters,
} from "@/components/test-runs/case-picker-state";
import { CasePickerSummary } from "@/components/test-runs/case-picker-summary";

interface CasePickerProps {
	onChange: (ids: string[]) => void;
	projectId: string;
	selectedIds: string[];
}

export function CasePicker({
	onChange,
	projectId,
	selectedIds,
}: CasePickerProps) {
	const filterState = usePickerFilters();
	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const casesQuery = useCasePickerCases(projectId, filterState.filters);
	const items = casesQuery.data?.items ?? [];
	const selection = useCasePickerSelection({
		items,
		onChange,
		selectedIds,
		selectedSet,
	});

	const hasData = casesQuery.data !== undefined;
	const total = casesQuery.data?.total ?? 0;

	return (
		<div className="flex min-h-0 flex-col gap-3">
			<div className="flex min-h-0 flex-1 gap-3">
				<div className="w-52 shrink-0 overflow-y-auto rounded-md border">
					<CasePickerModules
						onSelect={filterState.setModuleId}
						projectId={projectId}
						selectedModuleId={filterState.filters.moduleId}
					/>
				</div>
				<CasePickerResults
					cases={items}
					filterState={filterState}
					hasData={hasData}
					projectId={projectId}
					selectedIds={selectedSet}
					selection={selection}
					total={total}
				/>
			</div>
			<CasePickerSummary
				hasData={hasData}
				onClear={selection.clearSelection}
				page={filterState.filters.page}
				selectedCount={selectedIds.length}
				total={total}
			/>
		</div>
	);
}
