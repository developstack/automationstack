import { actualResultRequired } from "@automationstack/db/repositories/test-run-step-results-core";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import { Textarea } from "@automationstack/ui/components/textarea";
import { type ChangeEvent, useCallback } from "react";

import { RUN_STEP_COLUMN_TITLE } from "@/components/test-runs/run-panel-typography";

const PLACEHOLDER =
	"这一步实际发生了什么。失败和阻塞时必填，会汇总进用例说明并带进 Jira";

interface StepActualResultFieldProps {
	editing: boolean;
	onChange: (stepId: string, text: string) => void;
	result: TestRunStepResult | undefined;
	stepId: string;
	value: string;
}

function ReadOnlyActualResult({ value }: { value: string }) {
	if (value.trim() === "") {
		return <p className="text-muted-foreground text-sm">—</p>;
	}
	return <p className="whitespace-pre-wrap break-words text-sm">{value}</p>;
}

/** 步骤卡片的「实际结果」一栏：编辑时是输入框，失败和阻塞时必填；不编辑时（包括已提交和已作废）只读。 */
export function StepActualResultField({
	editing,
	onChange,
	result,
	stepId,
	value,
}: StepActualResultFieldProps) {
	const headingId = `run-step-actual-${stepId}`;
	const required = result !== undefined && actualResultRequired(result);
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) =>
			onChange(stepId, event.target.value),
		[onChange, stepId]
	);
	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<div className="flex items-baseline gap-1.5">
				<h4 className={RUN_STEP_COLUMN_TITLE} id={headingId}>
					实际结果
				</h4>
				{editing && required ? (
					<span className="text-destructive text-xs">必填</span>
				) : null}
			</div>
			{editing ? (
				<Textarea
					aria-invalid={required && value.trim() === ""}
					aria-labelledby={headingId}
					aria-required={required}
					onChange={handleChange}
					placeholder={PLACEHOLDER}
					rows={3}
					value={value}
				/>
			) : (
				<ReadOnlyActualResult value={value} />
			)}
		</div>
	);
}
