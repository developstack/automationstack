import type {
	DraggableAttributes,
	DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";

import { makeDropId } from "@/components/workspace/module-drop-plan";

export const ACTIVE_ZONE = "bg-primary";

export interface ModuleRowDrag {
	attributes: DraggableAttributes;
	isDragging: boolean;
	listeners: DraggableSyntheticListeners;
	setActivatorNodeRef: (element: HTMLElement | null) => void;
	setRowRef: (element: HTMLElement | null) => void;
}

export function useModuleRowDrag(moduleId: string): ModuleRowDrag {
	const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } =
		useDraggable({ id: moduleId });
	return {
		attributes,
		isDragging,
		listeners,
		setActivatorNodeRef,
		setRowRef: setNodeRef,
	};
}

export function useModuleRowDrop(moduleId: string) {
	const { isOver, setNodeRef } = useDroppable({
		id: makeDropId("inside", moduleId),
	});
	return { insideClassName: isOver ? "ring-1 ring-primary" : "", setNodeRef };
}
