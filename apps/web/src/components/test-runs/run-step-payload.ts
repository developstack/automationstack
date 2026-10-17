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
 * 没有判定的步骤不提交，服务端按跳过记录；但写了实际结果的步骤按跳过提交，这段文字不丢。
 */
export function buildStepPayload(
	steps: readonly CaseStep[],
	judged: Readonly<Record<string, TestRunStepResult>>,
	actualResults: Readonly<Record<string, string>>
): StepVerdictPayload[] {
	const payload: StepVerdictPayload[] = [];
	for (const step of steps) {
		const actualResult = normalizeActualResult(actualResults[step.id]);
		const result =
			judged[step.id] ?? (actualResult === null ? undefined : "skipped");
		if (result !== undefined) {
			payload.push({ actualResult, result, stepId: step.id });
		}
	}
	return payload;
}
