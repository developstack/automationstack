import type { CaseStep } from "@automationstack/db/schema/test-cases";
import {
	type Announcements,
	closestCenter,
	type DragEndEvent,
	PointerSensor,
	type ScreenReaderInstructions,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { type CSSProperties, useCallback, useMemo } from "react";

import { dropStep } from "@/components/cases/step-order";

const DRAG_ACTIVATION_DISTANCE_PX = 4;

/** 把手只响应指针。键盘用户使用每一步的「上移」和「下移」按钮。 */
const instructions: ScreenReaderInstructions = {
	draggable: "用每一步的上移和下移按钮调整步骤顺序。",
};

function stepPosition(steps: readonly CaseStep[], id: string | number): string {
	const index = steps.findIndex((step) => step.id === String(id));
	return index === -1 ? "列表外" : `第 ${index + 1} 步`;
}

function createAnnouncements(steps: readonly CaseStep[]): Announcements {
	return {
		onDragCancel: ({ active }) =>
			`已取消拖动，${stepPosition(steps, active.id)}的位置不变。`,
		onDragEnd: ({ active, over }) =>
			over === null
				? `已放下，${stepPosition(steps, active.id)}的位置不变。`
				: `已把${stepPosition(steps, active.id)}放到${stepPosition(steps, over.id)}的位置。`,
		onDragOver: ({ over }) =>
			over === null
				? "当前没有落点。"
				: `落点：${stepPosition(steps, over.id)}`,
		onDragStart: ({ active }) => `已拿起${stepPosition(steps, active.id)}。`,
	};
}

/** 步骤列表的拖动排序：传给 DndContext 的属性。 */
export function useStepDrag(
	steps: CaseStep[],
	onReorder: (steps: CaseStep[]) => void
) {
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX },
		})
	);

	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			const overId = event.over === null ? null : String(event.over.id);
			const next = dropStep(steps, String(event.active.id), overId);
			if (next !== steps) {
				onReorder(next);
			}
		},
		[onReorder, steps]
	);

	const accessibility = useMemo(
		() => ({
			announcements: createAnnouncements(steps),
			screenReaderInstructions: instructions,
		}),
		[steps]
	);

	return {
		accessibility,
		collisionDetection: closestCenter,
		onDragEnd,
		sensors,
	};
}

export type StepDropEdge = "after" | "before" | null;

/** 一步的拖动状态：把手的属性、行的位移，以及放下时插入线在行的上边还是下边。 */
export function useStepRowDrag(id: string, index: number) {
	const draggable = useDraggable({ data: { index }, id });
	const droppable = useDroppable({ id });
	const { setNodeRef: setDragRef } = draggable;
	const { setNodeRef: setDropRef } = droppable;
	const setRowRef = useCallback(
		(node: HTMLElement | null) => {
			setDragRef(node);
			setDropRef(node);
		},
		[setDragRef, setDropRef]
	);

	const activeIndex = droppable.active?.data.current?.index;
	let dropEdge: StepDropEdge = null;
	if (
		droppable.isOver &&
		typeof activeIndex === "number" &&
		activeIndex !== index
	) {
		dropEdge = activeIndex < index ? "after" : "before";
	}

	const { transform } = draggable;
	const style: CSSProperties | undefined =
		transform === null
			? undefined
			: { transform: `translate3d(0, ${transform.y}px, 0)` };

	return {
		dropEdge,
		handle: {
			listeners: draggable.listeners,
			setRef: draggable.setActivatorNodeRef,
		},
		isDragging: draggable.isDragging,
		setRowRef,
		style,
	};
}
