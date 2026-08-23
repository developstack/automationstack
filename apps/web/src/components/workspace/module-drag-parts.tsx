/**
 * 模块树拖拽的可视部件：拖拽把手、行间插入条、根层级末尾落点。
 * 只负责注册 dnd-kit 的 draggable/droppable 与落点高亮，具体动作解析在
 * module-drop-plan.ts，落库在 use-module-drag.ts。
 */
import { cn } from "@automationstack/ui/lib/utils";
import type {
	DraggableAttributes,
	DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVerticalIcon } from "lucide-react";

import {
	makeDropId,
	ROOT_END_DROP_ID,
} from "@/components/workspace/module-drop-plan";

/** 插入条与末尾落点共用的高亮色。 */
const ACTIVE_ZONE = "bg-primary";

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

interface ModuleDragHandleProps {
	drag: ModuleRowDrag;
	name: string;
}

/** 行首的拖拽把手；平时透明，悬停或键盘聚焦时显形。 */
export function ModuleDragHandle({ drag, name }: ModuleDragHandleProps) {
	return (
		<button
			aria-label={`拖拽排序：${name}`}
			className={cn(
				// size-6 = 24×24：WCAG 2.5.8 的目标尺寸下限。
				// opacity-0 只是透明，把手始终占位——所有模块行的内容起点因此恒定，
				// 悬停显形时整行不会横向抖一下。
				// （「全部用例」那一行不跟这里对齐：它在模块树之上、不属于树，
				// 也不可拖拽，行首没有把手槽，名字直接从 px-2 的内边距起头。）
				"flex size-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 outline-none transition-opacity",
				"focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring group-hover/module-row:opacity-100",
				drag.isDragging && "cursor-grabbing opacity-100"
			)}
			ref={drag.setActivatorNodeRef}
			type="button"
			{...drag.attributes}
			{...drag.listeners}
		>
			<GripVerticalIcon className="icon-stroke-regular size-3" />
		</button>
	);
}

/** 行与行之间的插入条：落在这里 = 插到该模块之前。 */
export function ModuleDropStrip({ moduleId }: { moduleId: string }) {
	const { isOver, setNodeRef } = useDroppable({
		id: makeDropId("before", moduleId),
	});
	return (
		<div
			className={cn("h-1.5 w-full", isOver && ACTIVE_ZONE)}
			ref={setNodeRef}
		/>
	);
}

/** 模块树末尾的落点：落在这里 = 移到根层级最后一位。 */
export function ModuleRootDropEnd() {
	const { isOver, setNodeRef } = useDroppable({ id: ROOT_END_DROP_ID });
	return (
		<div className={cn("h-4 w-full", isOver && ACTIVE_ZONE)} ref={setNodeRef} />
	);
}

/** 行主体的落点：落在这里 = 改挂到该模块之下。 */
export function useModuleRowDrop(moduleId: string) {
	const { isOver, setNodeRef } = useDroppable({
		id: makeDropId("inside", moduleId),
	});
	return { insideClassName: isOver ? "ring-1 ring-primary" : "", setNodeRef };
}
