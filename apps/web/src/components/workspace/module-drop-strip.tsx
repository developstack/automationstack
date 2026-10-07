import { cn } from "@automationstack/ui/lib/utils";
import { useDroppable } from "@dnd-kit/core";

import { ACTIVE_ZONE } from "@/components/workspace/module-drag-parts";
import { makeDropId } from "@/components/workspace/module-drop-plan";

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
