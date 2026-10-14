import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { DndContext } from "@dnd-kit/core";
import { useCallback, useMemo } from "react";

import { ModuleCreateRow } from "@/components/workspace/module-create-row";
import {
	createModuleDragAnnouncements,
	moduleDragInstructions,
} from "@/components/workspace/module-drag-a11y";
import { ModuleNodeItem } from "@/components/workspace/module-node-item";
import { ModuleRootDropEnd } from "@/components/workspace/module-root-drop-end";
import { ModuleTreeEmpty } from "@/components/workspace/module-tree-empty";
import { useModuleDrag } from "@/components/workspace/use-module-drag";
import type { ModuleExpansion } from "@/components/workspace/use-module-expansion";
import {
	isCreatingIn,
	type ModuleTreeEditing,
} from "@/components/workspace/use-module-tree-edit";

const DRAG_CONTEXT_ID = "module-tree-dnd";

function useTreeDrag(
	projectId: string,
	nodes: ModuleTreeNode[],
	expansion: ModuleExpansion
) {
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
	return { accessibility, drag };
}

interface ModuleTreeListProps {
	editing: ModuleTreeEditing;
	expansion: ModuleExpansion;
	nodes: ModuleTreeNode[];
	projectId: string;
	selectedModuleId: string | undefined;
}

export function ModuleTreeList({
	editing,
	expansion,
	nodes,
	projectId,
	selectedModuleId,
}: ModuleTreeListProps) {
	const { accessibility, drag } = useTreeDrag(projectId, nodes, expansion);
	const { startCreate, stop } = editing;
	const createRoot = useCallback(() => startCreate(null), [startCreate]);
	const creatingRoot = isCreatingIn(editing.edit, null);
	const createRow = creatingRoot ? (
		<ModuleCreateRow onDone={stop} parentId={null} projectId={projectId} />
	) : null;

	if (nodes.length === 0) {
		return createRow ?? <ModuleTreeEmpty onCreateRoot={createRoot} />;
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
						depth={0}
						editing={editing}
						expansion={expansion}
						key={node.id}
						node={node}
						selectedModuleId={selectedModuleId}
					/>
				))}
				{createRow}
				<ModuleRootDropEnd />
			</div>
		</DndContext>
	);
}
