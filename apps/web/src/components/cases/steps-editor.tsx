import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { MarkdownField } from "@/components/cases/markdown-field";
import { StepRowActions } from "@/components/cases/step-row-actions";

interface StepRowProps {
	canMoveDown: boolean;
	canMoveUp: boolean;
	index: number;
	onChange: (id: string, patch: Partial<CaseStep>) => void;
	onMove: (id: string, delta: number) => void;
	onRemove: (id: string) => void;
	step: CaseStep;
}

function useStepRowHandlers(props: StepRowProps) {
	const { onChange, onMove, onRemove, step } = props;

	const handleStepChange = useCallback(
		(value: string) => onChange(step.id, { step: value }),
		[onChange, step.id]
	);
	const handleExpectedChange = useCallback(
		(value: string) => onChange(step.id, { expected: value }),
		[onChange, step.id]
	);
	const handleMoveUp = useCallback(
		() => onMove(step.id, -1),
		[onMove, step.id]
	);
	const handleMoveDown = useCallback(
		() => onMove(step.id, 1),
		[onMove, step.id]
	);
	const handleRemove = useCallback(
		() => onRemove(step.id),
		[onRemove, step.id]
	);

	return {
		handleExpectedChange,
		handleMoveDown,
		handleMoveUp,
		handleRemove,
		handleStepChange,
	};
}

function StepRow(props: StepRowProps) {
	const { step } = props;
	const {
		handleExpectedChange,
		handleMoveDown,
		handleMoveUp,
		handleRemove,
		handleStepChange,
	} = useStepRowHandlers(props);

	const [previewOpen, setPreviewOpen] = useState(false);
	const togglePreview = useCallback(() => setPreviewOpen((open) => !open), []);

	return (
		<li className="grid grid-cols-1 items-start gap-3 sm:grid-cols-case-step">
			<MarkdownField
				ariaLabel={`第 ${props.index + 1} 步操作`}
				onChange={handleStepChange}
				placeholder="操作步骤，支持 markdown"
				preview={previewOpen}
				value={step.step}
			/>
			<MarkdownField
				ariaLabel={`第 ${props.index + 1} 步预期结果`}
				onChange={handleExpectedChange}
				placeholder="预期结果，支持 markdown"
				preview={previewOpen}
				value={step.expected}
			/>
			<StepRowActions
				canMoveDown={props.canMoveDown}
				canMoveUp={props.canMoveUp}
				index={props.index}
				onMoveDown={handleMoveDown}
				onMoveUp={handleMoveUp}
				onRemove={handleRemove}
				onTogglePreview={togglePreview}
				previewOpen={previewOpen}
			/>
		</li>
	);
}

function moveStep(steps: CaseStep[], id: string, delta: number): CaseStep[] {
	const from = steps.findIndex((step) => step.id === id);
	const to = from + delta;
	if (from === -1 || to < 0 || to >= steps.length) {
		return steps;
	}
	const next = [...steps];
	const [moved] = next.splice(from, 1);
	if (moved) {
		next.splice(to, 0, moved);
	}
	return next;
}

function useStepActions(
	steps: CaseStep[],
	onChange: (steps: CaseStep[]) => void
) {
	return useMemo(
		() => ({
			add: () =>
				onChange([
					...steps,
					{ expected: "", id: crypto.randomUUID(), step: "" },
				]),
			change: (id: string, patch: Partial<CaseStep>) =>
				onChange(
					steps.map((step) => (step.id === id ? { ...step, ...patch } : step))
				),
			move: (id: string, delta: number) => onChange(moveStep(steps, id, delta)),
			remove: (id: string) => onChange(steps.filter((step) => step.id !== id)),
		}),
		[onChange, steps]
	);
}

interface StepsEditorProps {
	onChange: (steps: CaseStep[]) => void;
	steps: CaseStep[];
}

export function StepsEditor({ onChange, steps }: StepsEditorProps) {
	const actions = useStepActions(steps, onChange);

	return (
		<div className="flex flex-col gap-2">
			<span className="select-none font-medium text-sm leading-none">
				测试步骤
			</span>
			<div className="flex flex-col gap-4">
				{steps.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						还没有步骤，点击下面的按钮新增。
					</p>
				) : (
					<ol className="flex flex-col gap-4">
						{steps.map((step, index) => (
							<StepRow
								canMoveDown={index < steps.length - 1}
								canMoveUp={index > 0}
								index={index}
								key={step.id}
								onChange={actions.change}
								onMove={actions.move}
								onRemove={actions.remove}
								step={step}
							/>
						))}
					</ol>
				)}
				<Button
					className="self-start"
					onClick={actions.add}
					size="sm"
					type="button"
					variant="outline"
				>
					<PlusIcon data-icon="inline-start" />
					新增步骤
				</Button>
			</div>
		</div>
	);
}
