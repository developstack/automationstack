import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import { useCallback } from "react";

import {
	RESULT_ICONS,
	RESULT_LABELS,
	RESULT_TEXT_CLASSES,
	STEP_VERDICT_VALUES,
} from "@/components/test-runs/test-run-meta";

interface StepVerdictButtonProps {
	current: TestRunStepResult | undefined;
	onPick: (stepId: string, result: TestRunStepResult) => void;
	stepId: string;
	value: TestRunStepResult;
}

function StepVerdictButton({
	current,
	onPick,
	stepId,
	value,
}: StepVerdictButtonProps) {
	const handleClick = useCallback(
		() => onPick(stepId, value),
		[onPick, stepId, value]
	);
	const active = current === value;
	const Icon = RESULT_ICONS[value];
	return (
		<Button
			aria-checked={active}
			onClick={handleClick}
			role="radio"
			size="xs"
			type="button"
			variant={active ? "default" : "outline"}
		>
			<Icon
				aria-hidden="true"
				className={active ? undefined : RESULT_TEXT_CLASSES[value]}
			/>
			{RESULT_LABELS[value]}
		</Button>
	);
}

export function StepVerdictRow({
	current,
	index,
	onPick,
	stepId,
}: {
	current: TestRunStepResult | undefined;
	index: number;
	onPick: (stepId: string, result: TestRunStepResult) => void;
	stepId: string;
}) {
	return (
		<div
			aria-label={`步骤 ${index + 1} 的判定`}
			className="mt-3 flex flex-wrap gap-1.5 border-t pt-3"
			role="radiogroup"
		>
			{STEP_VERDICT_VALUES.map((value) => (
				<StepVerdictButton
					current={current}
					key={value}
					onPick={onPick}
					stepId={stepId}
					value={value}
				/>
			))}
		</div>
	);
}
