import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import { canPickCaseVerdict } from "@/components/test-runs/run-verdict-entry";
import { VerdictPicker } from "@/components/test-runs/run-verdict-picker";

function SteppedVerdictNote({
	hasStepResults,
	result,
}: {
	hasStepResults: boolean;
	result: TestRunCaseResult;
}) {
	const legacy = !hasStepResults && result !== "untested";
	return (
		<div className="flex flex-col gap-2">
			<p className={RUN_SECTION_TEXT}>
				本条用例有步骤，结论由下面的分步判定推导，不再单独选择。
			</p>
			{legacy ? (
				<p className={RUN_SECTION_TEXT}>
					这条结论是分步判定上线前打的，没有分步记录；重新逐步判定并保存后即可补齐。
				</p>
			) : null}
		</div>
	);
}

export interface VerdictBodyProps {
	canConclude: boolean;
	editing: boolean;
	hasSteps: boolean;
	onPick: (result: TestRunCaseResult) => void;
	runCase: RunCaseDetail["runCase"];
}

export function VerdictBody({
	canConclude,
	editing,
	hasSteps,
	onPick,
	runCase,
}: VerdictBodyProps) {
	if (canPickCaseVerdict({ editing, hasSteps })) {
		return (
			<VerdictPicker
				disabled={!canConclude}
				onPick={onPick}
				result={runCase.result}
			/>
		);
	}
	return (
		<SteppedVerdictNote
			hasStepResults={runCase.stepResults.length > 0}
			result={runCase.result}
		/>
	);
}
