import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { GripVerticalIcon } from "lucide-react";

import type { ModuleRowDrag } from "@/components/workspace/module-drag-parts";

interface ModuleDragHandleProps {
	drag: ModuleRowDrag;
	name: string;
}

export function ModuleDragHandle({ drag, name }: ModuleDragHandleProps) {
	return (
		<Button
			aria-label={`拖拽排序：${name}`}
			className={cn(
				"absolute start-7 top-1/2 flex size-6 -translate-y-1/2 cursor-grab items-center justify-center p-0 text-muted-foreground opacity-0 outline-none transition-opacity",
				"rounded-sm focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover/module-row:opacity-100",
				drag.isDragging && "cursor-grabbing opacity-100"
			)}
			data-drag-handle=""
			ref={drag.setActivatorNodeRef}
			type="button"
			variant="plain"
			{...drag.attributes}
			{...drag.listeners}
		>
			<GripVerticalIcon className="icon-stroke-regular size-3" />
		</Button>
	);
}
