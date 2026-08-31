/**
 * 模块树末尾的落点。原与把手、插入条同住 module-drag-parts.tsx，
 * 按「一个文件一个对外组件」拆开；高亮色仍由那个文件给。
 */
import { cn } from "@automationstack/ui/lib/utils";
import { useDroppable } from "@dnd-kit/core";

import { ACTIVE_ZONE } from "@/components/workspace/module-drag-parts";
import { ROOT_END_DROP_ID } from "@/components/workspace/module-drop-plan";

/** 模块树末尾的落点：落在这里 = 移到根层级最后一位。 */
export function ModuleRootDropEnd() {
	const { isOver, setNodeRef } = useDroppable({ id: ROOT_END_DROP_ID });
	return (
		<div className={cn("h-4 w-full", isOver && ACTIVE_ZONE)} ref={setNodeRef} />
	);
}
