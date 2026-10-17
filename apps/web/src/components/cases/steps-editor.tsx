import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { DndContext } from "@dnd-kit/core";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import { useStepDrag } from "@/components/cases/step-drag";
import { StepGridHeader } from "@/components/cases/step-grid-header";
import { moveStep } from "@/components/cases/step-order";
import { StepRow } from "@/components/cases/step-row";

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

interface StepsListProps {
	actions: ReturnType<typeof useStepActions>;
	onChange: (steps: CaseStep[]) => void;
	steps: CaseStep[];
}

function StepsList({ actions, onChange, steps }: StepsListProps) {
	const drag = useStepDrag(steps, onChange);
	return (
		<DndContext {...drag}>
			<StepGridHeader />
			<ol>
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
		</DndContext>
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
			<div className="rounded-lg border">
				{steps.length === 0 ? (
					<p className="border-b px-3 py-4 text-muted-foreground text-sm">
						还没有步骤。点击「新增步骤」添加操作步骤和预期结果。
					</p>
				) : (
					<StepsList actions={actions} onChange={onChange} steps={steps} />
				)}
				<div className="px-1.5 py-1.5">
					<Button onClick={actions.add} size="sm" type="button" variant="ghost">
						<PlusIcon data-icon="inline-start" />
						新增步骤
					</Button>
				</div>
			</div>
		</div>
	);
}
