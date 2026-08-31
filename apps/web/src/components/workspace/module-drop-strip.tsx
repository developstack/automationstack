/**
 * 模块行之间的插入条。原与把手、末尾落点同住 module-drag-parts.tsx，
 * 按「一个文件一个对外组件」拆开；高亮色仍由那个文件给。
 */
import { cn } from "@automationstack/ui/lib/utils";
import { useDroppable } from "@dnd-kit/core";

import { ACTIVE_ZONE } from "@/components/workspace/module-drag-parts";
import { makeDropId } from "@/components/workspace/module-drop-plan";

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
