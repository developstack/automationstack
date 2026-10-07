import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { type FormEvent, useCallback } from "react";

import {
	CaseFieldGrid,
	type CaseFieldsProps,
} from "@/components/cases/case-field-grid";
import { MarkdownField } from "@/components/cases/markdown-field";
import { StepsEditor } from "@/components/cases/steps-editor";

interface CaseFormProps extends CaseFieldsProps {
	formId?: string;
	nameError?: string;
	onSubmit?: () => void;
}

interface CaseBodyHandlersProps extends CaseFieldsProps {
	onSubmit?: () => void;
}

function useCaseBodyHandlers({
	onChange,
	onSubmit,
	values,
}: CaseBodyHandlersProps) {
	const handlePreconditions = useCallback(
		(preconditions: string) => onChange({ ...values, preconditions }),
		[onChange, values]
	);
	const handleSteps = useCallback(
		(steps: CaseStep[]) => onChange({ ...values, steps }),
		[onChange, values]
	);
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			onSubmit?.();
		},
		[onSubmit]
	);
	return { handlePreconditions, handleSteps, handleSubmit };
}

export function CaseForm({
	formId,
	nameError,
	onChange,
	onSubmit,
	values,
}: CaseFormProps) {
	const handlers = useCaseBodyHandlers({ onChange, onSubmit, values });

	return (
		<form
			className="flex flex-col gap-4"
			id={formId}
			noValidate={true}
			onSubmit={handlers.handleSubmit}
		>
			<CaseFieldGrid
				nameError={nameError}
				onChange={onChange}
				values={values}
			/>
			<MarkdownField
				ariaLabel="前置条件"
				id="case-preconditions"
				label="前置条件"
				onChange={handlers.handlePreconditions}
				placeholder="可选，支持 markdown"
				value={values.preconditions}
			/>
			<StepsEditor onChange={handlers.handleSteps} steps={values.steps} />
		</form>
	);
}
