import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import { VerdictBody } from "@/components/test-runs/run-case-verdict-body";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { VerdictComment } from "@/components/test-runs/run-verdict-comment";

interface VerdictPanelDecisionProps {
	canConclude: boolean;
	editing: boolean;
	hasSteps: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	runCase: RunCaseDetail["runCase"];
}

export function VerdictPanelDecision({
	canConclude,
	editing,
	hasSteps,
	onCommentSave,
	onPick,
	runCase,
}: VerdictPanelDecisionProps) {
	return (
		<>
			{editing ? (
				<VerdictBody
					canConclude={canConclude}
					editing={editing}
					hasSteps={hasSteps}
					onPick={onPick}
					runCase={runCase}
				/>
			) : null}
			<VerdictComment
				comment={runCase.comment}
				editable={editing && !hasSteps}
				onCommentSave={onCommentSave}
				result={runCase.result}
				runCaseId={runCase.id}
			/>
		</>
	);
}
