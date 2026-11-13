import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { cn } from "@automationstack/ui/lib/utils";
import { GripVerticalIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { StepCellEditor } from "@/components/cases/step-cell-editor";
import {
	type StepDropEdge,
	useStepRowDrag,
} from "@/components/cases/step-drag";
import { STEP_GRID_CLASS } from "@/components/cases/step-grid-header";
import { StepRowActions } from "@/components/cases/step-row-actions";
import { HintTooltip } from "@/components/interaction/hint-tooltip";

const DROP_EDGE_CLASS: Record<Exclude<StepDropEdge, null>, string> = {
	after: "before:bottom-0",
	before: "before:top-0",
};

export interface StepRowProps {
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
	return {
		handleExpectedChange: useCallback(
			(value: string) => onChange(step.id, { expected: value }),
			[onChange, step.id]
		),
		handleMoveDown: useCallback(() => onMove(step.id, 1), [onMove, step.id]),
		handleMoveUp: useCallback(() => onMove(step.id, -1), [onMove, step.id]),
		handleRemove: useCallback(() => onRemove(step.id), [onRemove, step.id]),
		handleStepChange: useCallback(
			(value: string) => onChange(step.id, { step: value }),
			[onChange, step.id]
		),
	};
}

function StepNumber({
	handle,
	position,
}: {
	handle: ReturnType<typeof useStepRowDrag>["handle"];
	position: number;
}) {
	return (
		<div className="flex items-center gap-1 sm:flex-col sm:pt-1">
			<HintTooltip label={`拖动第 ${position} 步排序`}>
				<span
					aria-hidden="true"
					className="flex size-6 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
					ref={handle.setRef}
					{...handle.listeners}
				>
					<GripVerticalIcon className="size-3.5" />
				</span>
			</HintTooltip>
			<span className="numeric text-muted-foreground text-xs">{position}</span>
		</div>
	);
}

function stepRowClass(drag: ReturnType<typeof useStepRowDrag>): string {
	return cn(
		STEP_GRID_CLASS,
		"relative items-start border-b py-3",
		drag.isDragging && "z-10 bg-card opacity-80 shadow-card",
		drag.dropEdge !== null &&
			"before:absolute before:inset-x-0 before:h-0.5 before:bg-primary",
		drag.dropEdge !== null && DROP_EDGE_CLASS[drag.dropEdge]
	);
}

/** 步骤编辑器的一行：拖动把手和编号、操作步骤和操作截图、预期结果和预期截图，以及行尾操作。 */
export function StepRow(props: StepRowProps) {
	const { index, step } = props;
	const position = index + 1;
	const handlers = useStepRowHandlers(props);
	const drag = useStepRowDrag(step.id, index);
	const [previewOpen, setPreviewOpen] = useState(false);
	const togglePreview = useCallback(() => setPreviewOpen((open) => !open), []);

	return (
		<li className={stepRowClass(drag)} ref={drag.setRowRef} style={drag.style}>
			<StepNumber handle={drag.handle} position={position} />
			<StepCellEditor
				ariaLabel={`第 ${position} 步操作`}
				group="actionScreenshots"
				onChange={props.onChange}
				onTextChange={handlers.handleStepChange}
				placeholder="操作步骤，支持 markdown"
				position={position}
				preview={previewOpen}
				step={step}
				value={step.step}
			/>
			<StepCellEditor
				ariaLabel={`第 ${position} 步预期结果`}
				group="expectedScreenshots"
				onChange={props.onChange}
				onTextChange={handlers.handleExpectedChange}
				placeholder="预期结果，支持 markdown"
				position={position}
				preview={previewOpen}
				step={step}
				value={step.expected}
			/>
			<StepRowActions
				canMoveDown={props.canMoveDown}
				canMoveUp={props.canMoveUp}
				index={index}
				onMoveDown={handlers.handleMoveDown}
				onMoveUp={handlers.handleMoveUp}
				onRemove={handlers.handleRemove}
				onTogglePreview={togglePreview}
				previewOpen={previewOpen}
			/>
		</li>
	);
}
