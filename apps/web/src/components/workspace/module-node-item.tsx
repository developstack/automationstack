import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import {
	Collapsible,
	CollapsibleContent,
} from "@automationstack/ui/components/collapsible";
import { useCallback } from "react";

import { ModuleCreateRow } from "@/components/workspace/module-create-row";
import { ModuleDropStrip } from "@/components/workspace/module-drop-strip";
import { ModuleNodeRow } from "@/components/workspace/module-node-row";
import type { ModuleExpansion } from "@/components/workspace/use-module-expansion";
import {
	isCreatingIn,
	isRenamingModule,
	type ModuleTreeEditing,
} from "@/components/workspace/use-module-tree-edit";

/** 子模块向右缩进，左侧的竖线对齐父模块的展开按钮，表示层级 */
const CHILDREN_CLASS = "ms-4 border-border border-s ps-0.5";

interface ModuleNodeItemProps {
	depth: number;
	editing: ModuleTreeEditing;
	expansion: ModuleExpansion;
	node: ModuleTreeNode;
	selectedModuleId: string | undefined;
}

export function ModuleNodeItem({
	depth,
	editing,
	expansion,
	node,
	selectedModuleId,
}: ModuleNodeItemProps) {
	const hasChildren = node.children.length > 0;
	const creatingChild = isCreatingIn(editing.edit, node.id);
	const open = expansion.isOpen(node.id, depth) || creatingChild;
	const handleOpenChange = useCallback(
		(next: boolean) => expansion.setOpen(node.id, next),
		[expansion, node.id]
	);

	return (
		<Collapsible onOpenChange={handleOpenChange} open={open}>
			<ModuleDropStrip moduleId={node.id} />
			<ModuleNodeRow
				editing={editing}
				hasChildren={hasChildren}
				node={node}
				open={open}
				renaming={isRenamingModule(editing.edit, node.id)}
				selected={node.id === selectedModuleId}
			/>
			{hasChildren || creatingChild ? (
				<CollapsibleContent className={CHILDREN_CLASS}>
					{node.children.map((child) => (
						<ModuleNodeItem
							depth={depth + 1}
							editing={editing}
							expansion={expansion}
							key={child.id}
							node={child}
							selectedModuleId={selectedModuleId}
						/>
					))}
					{creatingChild ? (
						<ModuleCreateRow
							onDone={editing.stop}
							parentId={node.id}
							projectId={node.projectId}
						/>
					) : null}
				</CollapsibleContent>
			) : null}
		</Collapsible>
	);
}
