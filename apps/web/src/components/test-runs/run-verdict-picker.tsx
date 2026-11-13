import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import { Kbd } from "@automationstack/ui/components/kbd";
import { useCallback } from "react";

import {
	RESULT_ICONS,
	RESULT_LABELS,
	RESULT_TEXT_CLASSES,
	VERDICT_SHORTCUT_KEYS,
	VERDICT_VALUES,
} from "@/components/test-runs/test-run-meta";

interface VerdictButtonProps {
	current: TestRunCaseResult;
	disabled: boolean;
	onPick: (result: TestRunCaseResult) => void;
	value: TestRunCaseResult;
}

function VerdictButton({
	current,
	disabled,
	onPick,
	value,
}: VerdictButtonProps) {
	const handleClick = useCallback(() => onPick(value), [onPick, value]);
	const active = current === value;
	const Icon = RESULT_ICONS[value];
	return (
		<Button
			aria-checked={active}
			aria-disabled={disabled || undefined}
			className="gap-1.5"
			onClick={disabled ? undefined : handleClick}
			role="radio"
			type="button"
			variant={active ? "default" : "outline"}
		>
			<Icon
				aria-hidden="true"
				className={active ? undefined : RESULT_TEXT_CLASSES[value]}
			/>
			{RESULT_LABELS[value]}
			<Kbd className="h-auto min-w-0 border bg-transparent font-mono text-current text-kbd-hint opacity-70">
				{VERDICT_SHORTCUT_KEYS[value]}
			</Kbd>
		</Button>
	);
}

export interface VerdictPickerProps {
	disabled: boolean;
	onPick: (result: TestRunCaseResult) => void;
	result: TestRunCaseResult;
}

export function VerdictPicker({
	disabled,
	onPick,
	result,
}: VerdictPickerProps) {
	return (
		<div
			aria-label="执行结论"
			className="flex flex-wrap gap-2"
			role="radiogroup"
		>
			{VERDICT_VALUES.map((value) => (
				<VerdictButton
					current={result}
					disabled={disabled}
					key={value}
					onPick={onPick}
					value={value}
				/>
			))}
		</div>
	);
}
