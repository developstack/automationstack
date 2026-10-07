import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import {
	Collapsible,
	CollapsibleContent,
} from "@automationstack/ui/components/collapsible";
import { useCallback, useState } from "react";

import { ModuleDropStrip } from "@/components/workspace/module-drop-strip";
import {
	type ModuleNodeActions,
	ModuleNodeRow,
} from "@/components/workspace/module-node-row";
import type { ModuleExpansion } from "@/components/workspace/use-module-expansion";

interface ModuleNodeItemProps {
	actions: ModuleNodeActions;
	depth: number;
	expansion: ModuleExpansion;
	node: ModuleTreeNode;
	selectedModuleId: string | undefined;
}

export function ModuleNodeItem({
	actions,
	depth,
	expansion,
	node,
	selectedModuleId,
}: ModuleNodeItemProps) {
	const [editing, setEditing] = useState(false);
	const hasChildren = node.children.length > 0;
	const open = expansion.isOpen(node.id, depth);
	const handleOpenChange = useCallback(
		(next: boolean) => expansion.setOpen(node.id, next),
		[expansion, node.id]
	);
	const startRename = useCallback(() => setEditing(true), []);
	const stopRename = useCallback(() => setEditing(false), []);

	return (
		<Collapsible onOpenChange={handleOpenChange} open={open}>
			<ModuleDropStrip moduleId={node.id} />
			<ModuleNodeRow
				actions={actions}
				depth={depth}
				editing={editing}
				hasChildren={hasChildren}
				node={node}
				onStartRename={startRename}
				onStopRename={stopRename}
				open={open}
				selected={node.id === selectedModuleId}
			/>
			{hasChildren ? (
				<CollapsibleContent className="ps-3">
					{node.children.map((child) => (
						<ModuleNodeItem
							actions={actions}
							depth={depth + 1}
							expansion={expansion}
							key={child.id}
							node={child}
							selectedModuleId={selectedModuleId}
						/>
					))}
				</CollapsibleContent>
			) : null}
		</Collapsible>
	);
}
