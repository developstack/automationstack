import { memo } from "react";
import { RunCaseRow } from "@/components/test-runs/run-case-row";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import type { CaseCollaborators } from "@/realtime/use-editing";

const MemoRunCaseRow = memo(RunCaseRow);

export interface RunCaseRowContext {
	checkedIds: ReadonlySet<string>;
	collaboratorsByCaseId: ReadonlyMap<string, CaseCollaborators>;
	onSelect: (runCaseId: string) => void;
	onToggleChecked: (runCaseId: string) => void;
	selectable: boolean;
	selectedRunCaseId: string | null;
}

export interface RunCaseRowsProps extends RunCaseRowContext {
	cases: readonly RunCaseDetail[];
}

/** 一组用例的行。滚动容器和分组由调用方提供，这里只负责排布。 */
export function RunCaseRows({
	cases,
	checkedIds,
	collaboratorsByCaseId,
	onSelect,
	onToggleChecked,
	selectable,
	selectedRunCaseId,
}: RunCaseRowsProps) {
	return (
		<ul className="flex flex-col">
			{cases.map((item) => (
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
			))}
		</ul>
	);
}
