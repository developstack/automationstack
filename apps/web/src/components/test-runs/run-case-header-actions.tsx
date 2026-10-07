import { Button } from "@automationstack/ui/components/button";
import { PencilIcon } from "lucide-react";

import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { ResetVerdictButton } from "@/components/test-runs/run-reset-verdict-button";

export interface RunCaseHeaderActionsProps {
	canConclude: boolean;
	editing: boolean;
	onEdit: (() => void) | null;
	onReset: () => void;
	runCase: RunCaseDetail["runCase"];
}

export function RunCaseHeaderActions({
	canConclude,
	editing,
	onEdit,
	onReset,
	runCase,
}: RunCaseHeaderActionsProps) {
	const editAction = editing ? null : onEdit;
	const showReset = runCase.result !== "untested";
	if (editAction === null && !showReset) {
		return null;
	}
	return (
		<div className="flex shrink-0 items-center gap-2">
			{editAction === null ? null : (
				<Button onClick={editAction} size="sm" type="button" variant="outline">
					<PencilIcon aria-hidden="true" data-icon="inline-start" />
					修改
				</Button>
			)}
			{showReset ? (
				<ResetVerdictButton
					canConclude={canConclude}
					comment={runCase.comment}
					onReset={onReset}
					stepResultCount={runCase.stepResults.length}
				/>
			) : null}
		</div>
	);
}
