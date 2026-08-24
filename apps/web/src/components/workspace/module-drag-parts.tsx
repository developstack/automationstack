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

/**
 * 拖拽把手；平时透明，悬停或键盘聚焦时显形。
 *
 * 绝对定位、**不占流内宽度**：它原先是行首第一个流内子元素，白白吃掉 24 + gap 4
 * 共 28px，把整棵模块树顶得比「项目概览 / 测试评审和执行 / 未完成草稿」那几行
 * 深一整档——而「全部用例」那一行撤掉之后，这一档缩进底下已经没有父项了。
 * 移出文档流后，模块行第一个流内元素是展开箭头，正落在侧栏 16px 的 gutter 线上，
 * 与上面几行的行首图标同起点。
 *
 * start-8 = 32px：行的 padding box 左沿（= 面板 8px 处）往右 32px，正好是
 * 「展开箭头 24 + 行内 gap-1 的 4」再加 4px，落在模块名链接里那枚 size-3.5
 * 文件夹图标那一格上（面板 40~64px）。刻意压在这一格而不是压在行首：
 * 左边 40px 之前是展开箭头的点击区、右边 64px 之后是模块名，两个都是可点的，
 * 盖住任何一个都会把功能吃掉；文件夹图标纯装饰，可以让位。
 * 让位的做法见 module-node-links.tsx：行悬停时它淡出，把这一格交给把手，
 * 两者都不改变布局，所以显形时整行不会横向抖一下。
 */
export function ModuleDragHandle({ drag, name }: ModuleDragHandleProps) {
	return (
		<button
			aria-label={`拖拽排序：${name}`}
			className={cn(
				// size-6 = 24×24：WCAG 2.5.8 的目标尺寸下限，不能再小。
				// 绝对定位后它对每一行的贡献都是 0 宽度，因此「所有模块行的内容起点恒定」
				// 这条比原先靠 opacity-0 占位更硬——有没有把手都不影响行内布局。
				"absolute start-8 top-1/2 flex size-6 -translate-y-1/2 cursor-grab items-center justify-center text-muted-foreground opacity-0 outline-none transition-opacity",
				"focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring group-hover/module-row:opacity-100",
				drag.isDragging && "cursor-grabbing opacity-100"
			)}
			// 纯样式钩子：模块名前那枚文件夹图标要在把手显形时让位，而「显形」有
			// 悬停与键盘聚焦两种。悬停可以用 group-hover 表达，键盘聚焦不行——
			// group-focus-within 会连模块名链接、脑图链接的聚焦一起算进来，
			// 那时把手并没有显形，文件夹却凭空消失。挂个标记让那边精确选中这一个按钮。
			data-drag-handle=""
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
