import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import type { ChangeEvent } from "react";

import { reasonKindOf } from "@/components/test-runs/run-step-reason";
import { StepReasonField } from "@/components/test-runs/step-reason-field";
import { StepReasonNote } from "@/components/test-runs/step-reason-note";
import { StepVerdictRow } from "@/components/test-runs/step-verdict-row";

export function StepCardFooter({
	comment,
	editing,
	index,
	onCommentChange,
	onPick,
	result,
	stepId,
}: {
	comment: string;
	editing: boolean;
	index: number;
	onCommentChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	onPick: (stepId: string, result: TestRunStepResult) => void;
	result: TestRunStepResult | undefined;
	stepId: string;
}) {
	const kind = reasonKindOf(result);
	if (!editing) {
		return kind !== null && comment !== "" ? (
			<StepReasonNote kind={kind} value={comment} />
		) : null;
	}
	return (
		<>
			<StepVerdictRow
				current={result}
				index={index}
				onPick={onPick}
				stepId={stepId}
			/>
			{kind === null ? null : (
				<StepReasonField
					kind={kind}
					onChange={onCommentChange}
					stepId={stepId}
					value={comment}
				/>
			)}
		</>
	);
}
