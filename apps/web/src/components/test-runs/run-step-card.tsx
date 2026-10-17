import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { RunCaseResultBadge } from "@/components/test-runs/run-case-result-badge";
import { RunStepColumn } from "@/components/test-runs/run-step-column";
import { StepActualResultField } from "@/components/test-runs/step-actual-result-field";
import { StepVerdictRow } from "@/components/test-runs/step-verdict-row";

function StepResultBadge({
	result,
}: {
	result: TestRunStepResult | undefined;
}) {
	if (result === undefined) {
		return (
			<span className="rounded-md bg-muted px-1.5 py-0.5 font-normal text-muted-foreground text-xs">
				未判定
			</span>
		);
	}
	return <RunCaseResultBadge result={result} size="sm" />;
}

export interface RunStepCardProps {
	actualResult: string;
	editing: boolean;
	imageUrls: MarkdownImageUrls;
	index: number;
	onActualResultChange: (stepId: string, text: string) => void;
	onPick: (stepId: string, result: TestRunStepResult) => void;
	result: TestRunStepResult | undefined;
	step: CaseStep;
}

type StepColumnsProps = Omit<RunStepCardProps, "index" | "onPick"> & {
	position: number;
};

/** 三栏：步骤（含操作截图）、预期结果（含预期截图）、实际结果。卡片够宽时并排，窄时堆叠。 */
function StepColumns({
	actualResult,
	editing,
	imageUrls,
	onActualResultChange,
	position,
	result,
	step,
}: StepColumnsProps) {
	return (
		<div className="grid @2xl:grid-cols-3 grid-cols-1 gap-4">
			<RunStepColumn
				group="actionScreenshots"
				imageUrls={imageUrls}
				position={position}
				step={step}
				text={step.step}
				title="步骤"
			/>
			<RunStepColumn
				group="expectedScreenshots"
				imageUrls={imageUrls}
				position={position}
				step={step}
				text={step.expected}
				title="预期结果"
			/>
			<StepActualResultField
				editing={editing}
				onChange={onActualResultChange}
				position={position}
				result={result}
				stepId={step.id}
				value={actualResult}
			/>
		</div>
	);
}

/**
 * 执行页的步骤卡片：步骤、预期结果、实际结果三栏，编辑时下方是判定。
 * 卡片够宽时三栏并排，窄时上下堆叠（按卡片的宽度，不按屏幕的宽度）。
 */
export function RunStepCard({
	actualResult,
	editing,
	imageUrls,
	index,
	onActualResultChange,
	onPick,
	result,
	step,
}: RunStepCardProps) {
	const position = index + 1;
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle className="flex items-center justify-between gap-2">
					<span className="text-muted-foreground tabular-nums">
						步骤 {position}
					</span>
					<StepResultBadge result={result} />
				</CardTitle>
			</CardHeader>
			<CardContent className="@container">
				<StepColumns
					actualResult={actualResult}
					editing={editing}
					imageUrls={imageUrls}
					onActualResultChange={onActualResultChange}
					position={position}
					result={result}
					step={step}
				/>
				{editing ? (
					<StepVerdictRow
						current={result}
						index={index}
						onPick={onPick}
						stepId={step.id}
					/>
				) : null}
			</CardContent>
		</Card>
	);
}
