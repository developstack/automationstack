import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { DndContext } from "@dnd-kit/core";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import { useStepDrag } from "@/components/cases/step-drag";
import { moveStep } from "@/components/cases/step-order";
import { STEP_GRID_CLASS, StepRow } from "@/components/cases/step-row";

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

/** 表头与只读的步骤表格（CaseStepsTable）一致：小标签、灰色。窄屏不显示。 */
function StepsHeader() {
	return (
		<div
			aria-hidden="true"
			className={cn(
				STEP_GRID_CLASS,
				"eyebrow hidden h-10 items-center border-b font-medium sm:grid"
			)}
		>
			<span className="pl-1">#</span>
			<span>操作步骤</span>
			<span>预期结果</span>
			<span className="w-6" />
		</div>
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
			<StepsHeader />
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
			<div className="overflow-hidden rounded-lg border">
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
