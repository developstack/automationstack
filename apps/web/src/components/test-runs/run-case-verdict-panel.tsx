import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import {
	Collapsible,
	CollapsibleContent,
} from "@automationstack/ui/components/collapsible";

import { RunCaseLastVerdict } from "@/components/test-runs/run-case-last-verdict";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { RunSectionTrigger } from "@/components/test-runs/run-section-trigger";
import { VerdictEvidence } from "@/components/test-runs/verdict-evidence";
import { VerdictPanelDecision } from "@/components/test-runs/verdict-panel-decision";
import { VerdictPanelNotes } from "@/components/test-runs/verdict-panel-notes";

export interface RunCaseVerdictPanelProps {
	canConclude: boolean;
	editing: boolean;
	hasSteps: boolean;
	item: RunCaseDetail;
	locked: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
}

function VerdictPanelBody({
	canConclude,
	editing,
	hasSteps,
	item,
	locked,
	onCommentSave,
	onPick,
}: RunCaseVerdictPanelProps) {
	const { executedByName, runCase, testCase } = item;
	return (
		<div className="flex flex-col gap-3 pb-2">
			<VerdictPanelNotes
				canConclude={canConclude}
				editing={editing}
				hasSteps={hasSteps}
				locked={locked}
			/>
			<RunCaseLastVerdict
				executedAt={runCase.executedAt}
				executedByName={executedByName}
				result={runCase.result}
			/>
			<VerdictPanelDecision
				canConclude={canConclude}
				editing={editing}
				hasSteps={hasSteps}
				onCommentSave={onCommentSave}
				onPick={onPick}
				runCase={runCase}
			/>
			<VerdictEvidence
				runCase={runCase}
				stepIds={testCase.steps.map((step) => step.id)}
			/>
		</div>
	);
}

export function RunCaseVerdictPanel(props: RunCaseVerdictPanelProps) {
	return (
		<Collapsible className="group/run-section flex flex-col" defaultOpen>
			<RunSectionTrigger label="执行结论" />
			<CollapsibleContent className="collapsible-panel">
				<VerdictPanelBody {...props} />
			</CollapsibleContent>
		</Collapsible>
	);
}
