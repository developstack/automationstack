import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import { formatDateTime } from "@/components/cases/case-meta";
import { DELETED_ACTOR } from "@/components/test-runs/run-case-events";
import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import { RESULT_LABELS } from "@/components/test-runs/test-run-meta";

export interface RunCaseLastVerdictProps {
	executedAt: Date | null;
	executedByName: string | null;
	result: TestRunCaseResult;
}

export function RunCaseLastVerdict({
	executedAt,
	executedByName,
	result,
}: RunCaseLastVerdictProps) {
	if (result === "untested" || executedAt === null) {
		return null;
	}
	return (
		<p className={RUN_SECTION_TEXT}>
			{`最后由 ${executedByName ?? DELETED_ACTOR} 于 ${formatDateTime(executedAt)} 判定为 `}
			<span className="font-medium">{RESULT_LABELS[result]}</span>
		</p>
	);
}
