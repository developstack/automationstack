/**
 * 模块树的列表主体（DndContext + 递归节点 + 空态）。原与 ModuleTree 同住
 * module-tree.tsx，按「同文件最多 2 个私有辅助组件」拆出来；空态只服务于它，
 * 跟着一起搬。
 */
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

/** 模块树主体：整棵树共用一个 DndContext，落点条与根末尾落点都在其内。 */
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
	// 播报文案要按 id 查模块名，只能随树重建；useMemo 保住「不要每次渲染换新对象」
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
			// 固定 id：dnd-kit 默认用模块级自增计数器生成 aria-describedby，
			// SSR 与客户端算出的序号不一致会触发 hydration mismatch。
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
