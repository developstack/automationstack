/**
 * 模块树的递归单元：一行 + （递归的）它的子树。原文件名 module-tree-node.tsx，
 * 与唯一对外组件 ModuleNodeItem 对不上，随本次拆分改名；行本身连同它的右键菜单、
 * 展开箭头一起搬到了 module-node-row.tsx。
 */
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
	/** 根节点为 0；展开规则按深度算，见 module-expansion.ts。 */
	depth: number;
	expansion: ModuleExpansion;
	node: ModuleTreeNode;
	selectedModuleId: string | undefined;
}

/** One module row plus (recursively) its children. */
export function ModuleNodeItem({
	actions,
	depth,
	expansion,
	node,
	selectedModuleId,
}: ModuleNodeItemProps) {
	const [editing, setEditing] = useState(false);
	const hasChildren = node.children.length > 0;
	// 展开状态是整棵树共用的一份，节点自己不持有 —— 否则 modules.tree 一刷新就丢。
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
			{/* ps-3 而非 pl-3：缩进是方向相关的布局，逻辑属性才跟着书写方向翻面。 */}
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
