import { normalizeActualResult } from "@automationstack/db/repositories/test-run-step-results-core";
import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";

export interface StepVerdictPayload {
	actualResult: string | null;
	result: TestRunStepResult;
	stepId: string;
}

/**
 * 保存判定时提交的步骤，按用例的步骤顺序。每个判定都带上实际结果（去掉首尾空白，空时为 null）。
 * 没有判定的步骤不提交，服务端按跳过记录。没有判定的步骤不能保存实际结果，
 * 有实际结果时 useRunStepSave 阻止保存，所以这里不会丢掉文字。
 */
export function buildStepPayload(
	steps: readonly CaseStep[],
	judged: Readonly<Record<string, TestRunStepResult>>,
	actualResults: Readonly<Record<string, string>>
): StepVerdictPayload[] {
	return steps.flatMap((step) => {
		const result = judged[step.id];
		if (result === undefined) {
			return [];
		}
		return [
			{
				actualResult: normalizeActualResult(actualResults[step.id]),
				result,
				stepId: step.id,
			},
		];
	});
}
