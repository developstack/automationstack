import { Textarea } from "@automationstack/ui/components/textarea";
import type { ChangeEvent } from "react";

import {
	REASON_FIELD_CLASSES,
	REASON_FIELD_TEXT,
	type ReasonKind,
} from "@/components/test-runs/run-step-reason";
import { RESULT_TEXT_CLASSES } from "@/components/test-runs/test-run-meta";

interface StepReasonFieldProps {
	kind: ReasonKind;
	onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	stepId: string;
	value: string;
}

export function StepReasonField({
	kind,
	onChange,
	stepId,
	value,
}: StepReasonFieldProps) {
	const text = REASON_FIELD_TEXT[kind];
	const fieldId = `run-step-reason-${stepId}`;
	return (
		<div className="mt-3 flex flex-col gap-1.5">
			<label className="font-medium text-xs" htmlFor={fieldId}>
				<span className={RESULT_TEXT_CLASSES[kind]}>{text.label}</span>
			</label>
			<Textarea
				className={REASON_FIELD_CLASSES[kind]}
				id={fieldId}
				onChange={onChange}
				placeholder={text.placeholder}
				rows={2}
				value={value}
			/>
		</div>
	);
}
