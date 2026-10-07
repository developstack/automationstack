import { memo } from "react";

import { BulkToolbar } from "@/components/test-runs/run-case-bulk-toolbar";
import { RunCaseFilters } from "@/components/test-runs/run-case-filters";
import { RunCaseRow } from "@/components/test-runs/run-case-row";
import type {
	ModuleOption,
	RunCaseDetail,
	RunCaseFilter,
} from "@/components/test-runs/run-execution-meta";
import {
	type CaseCollaborators,
	useCollaboratorsByCaseId,
} from "@/realtime/use-editing";

const MemoRunCaseRow = memo(RunCaseRow);

function RunCaseRows({
	cases,
	checkedIds,
	collaboratorsByCaseId,
	onSelect,
	onToggleChecked,
	selectable,
	selectedRunCaseId,
}: {
	cases: readonly RunCaseDetail[];
	checkedIds: ReadonlySet<string>;
	collaboratorsByCaseId: ReadonlyMap<string, CaseCollaborators>;
	onSelect: (runCaseId: string) => void;
	onToggleChecked: (runCaseId: string) => void;
	selectable: boolean;
	selectedRunCaseId: string | null;
}) {
	return (
		<ul className="relative min-h-0 flex-1 overflow-y-auto pb-2">
			{cases.length === 0 ? (
				<li className="px-4 py-8 text-center text-muted-foreground text-sm">
					当前筛选下没有用例。
				</li>
			) : (
				cases.map((item) => (
					<MemoRunCaseRow
						checked={checkedIds.has(item.runCase.id)}
						collaborators={collaboratorsByCaseId.get(item.testCase.id)}
						item={item}
						key={item.runCase.id}
						onSelect={onSelect}
						onToggleChecked={onToggleChecked}
						selectable={selectable}
						selected={item.runCase.id === selectedRunCaseId}
					/>
				))
			)}
		</ul>
	);
}

const MemoRunCaseRows = memo(RunCaseRows);

export interface RunCaseListProps {
	canConclude: boolean;
	canEditCases: boolean;
	cases: readonly RunCaseDetail[];
	checkedIds: ReadonlySet<string>;
	filter: RunCaseFilter;
	moduleOptions: readonly ModuleOption[];
	onAddCases: () => void;
	onAssignToMe: () => void;
	onBulkPass: () => void;
	onFilterChange: (filter: RunCaseFilter) => void;
	onRemoveCases: () => void;
	onSelect: (runCaseId: string) => void;
	onToggleAll: () => void;
	onToggleChecked: (runCaseId: string) => void;
	selectedRunCaseId: string | null;
}

export function RunCaseList({
	canConclude,
	canEditCases,
	cases,
	checkedIds,
	filter,
	moduleOptions,
	onAddCases,
	onAssignToMe,
	onBulkPass,
	onFilterChange,
	onRemoveCases,
	onSelect,
	onToggleAll,
	onToggleChecked,
	selectedRunCaseId,
}: RunCaseListProps) {
	const collaboratorsByCaseId = useCollaboratorsByCaseId();

	const selectable = canConclude || canEditCases;

	return (
		<div className="flex min-h-0 min-w-0 flex-col gap-2 border-r pt-2">
			<RunCaseFilters
				filter={filter}
				moduleOptions={moduleOptions}
				onFilterChange={onFilterChange}
			/>
			<BulkToolbar
				canConclude={canConclude}
				canEditCases={canEditCases}
				checkedCount={checkedIds.size}
				onAddCases={onAddCases}
				onAssignToMe={onAssignToMe}
				onBulkPass={onBulkPass}
				onRemoveCases={onRemoveCases}
				onToggleAll={onToggleAll}
				visibleCount={cases.length}
			/>
			<MemoRunCaseRows
				cases={cases}
				checkedIds={checkedIds}
				collaboratorsByCaseId={collaboratorsByCaseId}
				onSelect={onSelect}
				onToggleChecked={onToggleChecked}
				selectable={selectable}
				selectedRunCaseId={selectedRunCaseId}
			/>
		</div>
	);
}
