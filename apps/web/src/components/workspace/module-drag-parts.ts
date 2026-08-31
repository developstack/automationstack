/**
 * 模块树拖拽的共用底座：draggable / droppable 的注册与落点高亮色。
 * 三个可视部件各占一个文件（module-drag-handle.tsx、module-drop-strip.tsx、
 * module-root-drop-end.tsx），这里只留它们共用的 hook、类型与色值。
 * 具体动作解析在 module-drop-plan.ts，落库在 use-module-drag.ts。
 */

import type {
	DraggableAttributes,
	DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";

import { makeDropId } from "@/components/workspace/module-drop-plan";

/** 插入条与末尾落点共用的高亮色。 */
export const ACTIVE_ZONE = "bg-primary";

export interface ModuleRowDrag {
	attributes: DraggableAttributes;
	isDragging: boolean;
	listeners: DraggableSyntheticListeners;
	setActivatorNodeRef: (element: HTMLElement | null) => void;
	setRowRef: (element: HTMLElement | null) => void;
}

/**
 * 让整行成为拖拽体（碰撞矩形按行算，落点判定更符合直觉），
 * 但只有把手能发起拖拽，否则行内的链接与菜单按钮会被拖拽抢走点击。
 */
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

/** 行主体的落点：落在这里 = 改挂到该模块之下。 */
export function useModuleRowDrop(moduleId: string) {
	const { isOver, setNodeRef } = useDroppable({
		id: makeDropId("inside", moduleId),
	});
	return { insideClassName: isOver ? "ring-1 ring-primary" : "", setNodeRef };
}
