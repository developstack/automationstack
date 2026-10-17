import { stepsMissingActualResult } from "@automationstack/db/repositories/test-run-step-results-core";
import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type {
	TestRunCaseResult,
	TestRunStepResult,
} from "@automationstack/db/schema/test-runs";
import { useCallback, useMemo } from "react";

import { buildStepPayload } from "@/components/test-runs/run-step-payload";
import { useRunShortcuts } from "@/components/test-runs/use-run-shortcuts";
import { useSaveRunCaseStepResults } from "@/components/test-runs/use-test-run-mutations";

export interface RunStepSaveOptions {
	actualResults: Record<string, string>;
	caseVersion: number;
	judged: Record<string, TestRunStepResult>;
	onSaved: () => void;
	runCaseId: string;
	steps: readonly CaseStep[];
}

export interface RunStepSaveHandle {
	handleSave: () => void;
	/** 判为失败或阻塞、但没有填写实际结果的步骤序号。不为空时不能保存。 */
	missingActualResult: number[];
	saving: boolean;
}

export function useRunStepSave(options: RunStepSaveOptions): RunStepSaveHandle {
	const { actualResults, caseVersion, judged, onSaved, runCaseId, steps } =
		options;
	const mutation = useSaveRunCaseStepResults();
	const { mutate } = mutation;
	const missingActualResult = useMemo(
		() => stepsMissingActualResult(steps, judged, actualResults),
		[actualResults, judged, steps]
	);

	const handleSave = useCallback(() => {
		if (missingActualResult.length > 0) {
			return;
		}
		mutate(
			{
				caseVersion,
				runCaseId,
				steps: buildStepPayload(steps, judged, actualResults),
			},
			{ onSuccess: onSaved }
		);
	}, [
		actualResults,
		caseVersion,
		judged,
		missingActualResult,
		mutate,
		onSaved,
		runCaseId,
		steps,
	]);

	return { handleSave, missingActualResult, saving: mutation.isPending };
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
