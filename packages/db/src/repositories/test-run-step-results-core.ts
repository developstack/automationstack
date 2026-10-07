import type { CaseStep } from "../schema/test-cases";
import type {
	RunCaseStepResult,
	TestRunCaseResult,
	TestRunStepResult,
} from "../schema/test-run-enums";

export type JudgedSteps = Readonly<Record<string, TestRunStepResult>>;

export type StepComments = Readonly<Record<string, string>>;

const UNJUDGED_STEP_RESULT: TestRunStepResult = "skipped";

export function stepNeedsComment(result: TestRunStepResult): boolean {
	return result === "failed" || result === "blocked";
}

function pickComment(
	result: TestRunStepResult,
	text: string | undefined
): string | null {
	if (!stepNeedsComment(result)) {
		return null;
	}
	const trimmed = (text ?? "").trim();
	return trimmed === "" ? null : trimmed;
}

export function fillStepResults(
	steps: readonly CaseStep[],
	judged: JudgedSteps,
	comments: StepComments = {}
): RunCaseStepResult[] {
	return steps.map((step) => {
		const result = judged[step.id] ?? UNJUDGED_STEP_RESULT;
		return {
			comment: pickComment(result, comments[step.id]),
			result,
			stepId: step.id,
		};
	});
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

export function buildCaseComment(
	steps: readonly CaseStep[],
	stepResults: readonly RunCaseStepResult[]
): string | null {
	const numbers = stepNumbers(steps);
	const lines: string[] = [];
	for (const item of stepResults) {
		if (item.comment === null) {
			continue;
		}
		const number = numbers.get(item.stepId);
		const label = number === undefined ? "已删除的步骤" : `步骤 ${number}`;
		lines.push(`${label}：${item.comment}`);
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
