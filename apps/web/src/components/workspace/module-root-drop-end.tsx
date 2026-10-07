import { cn } from "@automationstack/ui/lib/utils";
import { useDroppable } from "@dnd-kit/core";

import { ACTIVE_ZONE } from "@/components/workspace/module-drag-parts";
import { ROOT_END_DROP_ID } from "@/components/workspace/module-drop-plan";

export function ModuleRootDropEnd() {
	const { isOver, setNodeRef } = useDroppable({ id: ROOT_END_DROP_ID });
	return (
		<div className={cn("h-4 w-full", isOver && ACTIVE_ZONE)} ref={setNodeRef} />
	);
}
