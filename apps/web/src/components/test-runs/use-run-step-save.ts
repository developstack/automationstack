import { stepNeedsComment } from "@automationstack/db/repositories/test-run-step-results-core";
import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type {
	TestRunCaseResult,
	TestRunStepResult,
} from "@automationstack/db/schema/test-runs";
import { useCallback } from "react";

import { useRunShortcuts } from "@/components/test-runs/use-run-shortcuts";
import { useSaveRunCaseStepResults } from "@/components/test-runs/use-test-run-mutations";

export interface StepVerdictPayload {
	comment: string | null;
	result: TestRunStepResult;
	stepId: string;
}

function buildStepPayload(
	steps: readonly CaseStep[],
	judged: Record<string, TestRunStepResult>,
	comments: Record<string, string>
): StepVerdictPayload[] {
	const payload: StepVerdictPayload[] = [];
	for (const step of steps) {
		const result = judged[step.id];
		if (result === undefined) {
			continue;
		}
		const text = (comments[step.id] ?? "").trim();
		payload.push({
			comment: stepNeedsComment(result) && text !== "" ? text : null,
			result,
			stepId: step.id,
		});
	}
	return payload;
}

export interface RunStepSaveOptions {
	caseVersion: number;
	comments: Record<string, string>;
	judged: Record<string, TestRunStepResult>;
	onSaved: () => void;
	runCaseId: string;
	steps: readonly CaseStep[];
}

export interface RunStepSaveHandle {
	handleSave: () => void;
	saving: boolean;
}

export function useRunStepSave(options: RunStepSaveOptions): RunStepSaveHandle {
	const { caseVersion, comments, judged, onSaved, runCaseId, steps } = options;
	const mutation = useSaveRunCaseStepResults();
	const { mutate } = mutation;

	const handleSave = useCallback(() => {
		mutate(
			{
				caseVersion,
				runCaseId,
				steps: buildStepPayload(steps, judged, comments),
			},
			{ onSuccess: onSaved }
		);
	}, [caseVersion, comments, judged, mutate, onSaved, runCaseId, steps]);

	return { handleSave, saving: mutation.isPending };
}

export interface RunStepShortcutOptions {
	enabled: boolean;
	judged: Record<string, TestRunStepResult>;
	setResult: (stepId: string, result: TestRunStepResult) => void;
	steps: readonly CaseStep[];
}

export function useRunStepShortcuts(options: RunStepShortcutOptions): void {
	const { enabled, judged, setResult, steps } = options;

	const onVerdict = useCallback(
		(result: TestRunCaseResult) => {
			if (result === "untested") {
				return;
			}
			const next = steps.find((step) => judged[step.id] === undefined);
			if (next !== undefined) {
				setResult(next.id, result);
			}
		},
		[judged, setResult, steps]
	);

	useRunShortcuts({ enabled, onVerdict });
}
