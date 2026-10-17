import type { CaseStep } from "../schema/test-cases";
import type {
	RunCaseStepResult,
	TestRunCaseResult,
	TestRunStepResult,
} from "../schema/test-run-enums";

export type JudgedSteps = Readonly<Record<string, TestRunStepResult>>;

/** 每个步骤的实际结果文字，按步骤 id 索引。 */
export type StepActualResults = Readonly<Record<string, string>>;

const UNJUDGED_STEP_RESULT: TestRunStepResult = "skipped";

/** 失败和阻塞的步骤必须填写实际结果；通过和跳过可以不填。 */
export function actualResultRequired(result: TestRunStepResult): boolean {
	return result === "failed" || result === "blocked";
}

/** 去掉首尾空白；只有空白或没有填写时为 null。 */
export function normalizeActualResult(text: string | undefined): string | null {
	const trimmed = (text ?? "").trim();
	return trimmed === "" ? null : trimmed;
}

export function fillStepResults(
	steps: readonly CaseStep[],
	judged: JudgedSteps,
	actualResults: StepActualResults = {}
): RunCaseStepResult[] {
	return steps.map((step) => ({
		actualResult: normalizeActualResult(actualResults[step.id]),
		result: judged[step.id] ?? UNJUDGED_STEP_RESULT,
		stepId: step.id,
	}));
}

/** 判为失败或阻塞、但没有填写实际结果的步骤的序号（从 1 开始）。没有判定的步骤按跳过记录，不检查。 */
export function stepsMissingActualResult(
	steps: readonly CaseStep[],
	judged: JudgedSteps,
	actualResults: StepActualResults
): number[] {
	const numbers: number[] = [];
	for (const [index, step] of steps.entries()) {
		const result = judged[step.id];
		const missing =
			result !== undefined &&
			actualResultRequired(result) &&
			normalizeActualResult(actualResults[step.id]) === null;
		if (missing) {
			numbers.push(index + 1);
		}
	}
	return numbers;
}

/**
 * 有实际结果（文字或实际附件）但没有判定的步骤的序号（从 1 开始）。
 * 没有判定的步骤不能保存实际结果：服务端拒绝保存，web 阻止保存。
 * attachedStepIds 是已有实际附件的步骤 id。
 */
export function unjudgedStepsWithActualResult(
	steps: readonly CaseStep[],
	judged: JudgedSteps,
	actualResults: StepActualResults,
	attachedStepIds: ReadonlySet<string>
): number[] {
	const numbers: number[] = [];
	for (const [index, step] of steps.entries()) {
		const hasActualResult =
			normalizeActualResult(actualResults[step.id]) !== null ||
			attachedStepIds.has(step.id);
		if (judged[step.id] === undefined && hasActualResult) {
			numbers.push(index + 1);
		}
	}
	return numbers;
}

export function deriveCaseResult(
	stepResults: readonly RunCaseStepResult[]
): TestRunCaseResult {
	if (stepResults.length === 0) {
		return "untested";
	}
	const has = (result: TestRunStepResult) =>
		stepResults.some((item) => item.result === result);
	if (has("failed")) {
		return "failed";
	}
	if (has("blocked")) {
		return "blocked";
	}
	return has("passed") ? "passed" : "skipped";
}

function stepNumbers(steps: readonly CaseStep[]): Map<string, number> {
	return new Map(steps.map((step, index) => [step.id, index + 1]));
}

/** 收进用例说明的步骤结果：只有失败和阻塞。 */
function summarisedInCaseComment(result: TestRunStepResult): boolean {
	return result === "failed" || result === "blocked";
}

/**
 * 用例说明：把失败和阻塞步骤的实际结果按步骤顺序折成多行，每行带步骤序号。
 * 通过和跳过的步骤不收。这段文字也带进 Jira 缺陷的「实际结果」。没有可收的步骤时为 null。
 */
export function buildCaseComment(
	steps: readonly CaseStep[],
	stepResults: readonly RunCaseStepResult[]
): string | null {
	const numbers = stepNumbers(steps);
	const lines: string[] = [];
	for (const item of stepResults) {
		if (item.actualResult === null || !summarisedInCaseComment(item.result)) {
			continue;
		}
		const number = numbers.get(item.stepId);
		const label = number === undefined ? "已删除的步骤" : `步骤 ${number}`;
		lines.push(`${label}：${item.actualResult}`);
	}
	return lines.length === 0 ? null : lines.join("\n");
}

export function unknownStepIds(
	steps: readonly CaseStep[],
	judged: JudgedSteps
): string[] {
	const known = new Set(steps.map((step) => step.id));
	return Object.keys(judged).filter((stepId) => !known.has(stepId));
}
