import { BulkToolbar } from "@/components/test-runs/run-case-bulk-toolbar";
import { RunCaseFilters } from "@/components/test-runs/run-case-filters";
import { RunCaseScrollArea } from "@/components/test-runs/run-case-scroll-area";
import type {
	ModuleOption,
	RunCaseDetail,
	RunCaseFilter,
} from "@/components/test-runs/run-execution-meta";
import { useCollaboratorsByCaseId } from "@/realtime/use-editing";

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
	projectId: string;
	runId: string;
	selectedModuleId: string | null;
	selectedRunCaseId: string | null;
}

export function RunCaseList(props: RunCaseListProps) {
	const collaboratorsByCaseId = useCollaboratorsByCaseId();
	const selectable = props.canConclude || props.canEditCases;

	return (
		<div className="flex min-h-0 min-w-0 flex-col gap-2 border-r pt-2">
			<RunCaseFilters
				filter={props.filter}
				moduleOptions={props.moduleOptions}
				onFilterChange={props.onFilterChange}
			/>
			<BulkToolbar
				canConclude={props.canConclude}
				canEditCases={props.canEditCases}
				checkedCount={props.checkedIds.size}
				onAddCases={props.onAddCases}
				onAssignToMe={props.onAssignToMe}
				onBulkPass={props.onBulkPass}
				onRemoveCases={props.onRemoveCases}
				onToggleAll={props.onToggleAll}
				visibleCount={props.cases.length}
			/>
			<RunCaseScrollArea
				{...props}
				collaboratorsByCaseId={collaboratorsByCaseId}
				selectable={selectable}
			/>
		</div>
	);
}
