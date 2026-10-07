import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { DndContext } from "@dnd-kit/core";
import { FolderTreeIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import {
	createModuleDragAnnouncements,
	moduleDragInstructions,
} from "@/components/workspace/module-drag-a11y";
import { ModuleNodeItem } from "@/components/workspace/module-node-item";
import type { ModuleNodeActions } from "@/components/workspace/module-node-row";
import { ModuleRootDropEnd } from "@/components/workspace/module-root-drop-end";
import { useModuleDrag } from "@/components/workspace/use-module-drag";
import type { ModuleExpansion } from "@/components/workspace/use-module-expansion";

const DRAG_CONTEXT_ID = "module-tree-dnd";

function ModuleTreeEmpty() {
	return (
		<Empty className="gap-2 p-4 md:p-6">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<FolderTreeIcon />
				</EmptyMedia>
				<EmptyTitle>暂无模块</EmptyTitle>
				<EmptyDescription className="text-xs">
					点击右上角的 + 新建第一个模块，用例会按模块归类。
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

interface ModuleTreeListProps {
	actions: ModuleNodeActions;
	expansion: ModuleExpansion;
	nodes: ModuleTreeNode[];
	projectId: string;
	selectedModuleId: string | undefined;
}

export function ModuleTreeList({
	actions,
	expansion,
	nodes,
	projectId,
	selectedModuleId,
}: ModuleTreeListProps) {
	const revealParent = useCallback(
		(parentId: string) => expansion.setOpen(parentId, true),
		[expansion]
	);
	const drag = useModuleDrag(projectId, nodes, revealParent);
	const accessibility = useMemo(
		() => ({
			announcements: createModuleDragAnnouncements(nodes),
			screenReaderInstructions: moduleDragInstructions,
		}),
		[nodes]
	);
	if (nodes.length === 0) {
		return <ModuleTreeEmpty />;
	}
	return (
		<DndContext
			accessibility={accessibility}
			collisionDetection={drag.collisionDetection}
			id={DRAG_CONTEXT_ID}
			onDragCancel={drag.onDragCancel}
			onDragEnd={drag.onDragEnd}
			onDragStart={drag.onDragStart}
			sensors={drag.sensors}
		>
			<div>
				{nodes.map((node) => (
					<ModuleNodeItem
						actions={actions}
						depth={0}
						expansion={expansion}
						key={node.id}
						node={node}
						selectedModuleId={selectedModuleId}
					/>
				))}
				<ModuleRootDropEnd />
			</div>
		</DndContext>
	);
}
