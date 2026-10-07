import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { Button } from "@automationstack/ui/components/button";
import { CollapsibleTrigger } from "@automationstack/ui/components/collapsible";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@automationstack/ui/components/context-menu";
import { cn } from "@automationstack/ui/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef } from "react";

import { ModuleDragHandle } from "@/components/workspace/module-drag-handle";
import {
	useModuleRowDrag,
	useModuleRowDrop,
} from "@/components/workspace/module-drag-parts";
import { ModuleMindmapLink } from "@/components/workspace/module-mindmap-link";
import { ModuleNodeLink } from "@/components/workspace/module-node-link";
import { ModuleRenameInput } from "@/components/workspace/module-rename-input";
import {
	contextMenuPointFromRect,
	isContextMenuKey,
} from "@/components/workspace/module-row-context-key";

export interface ModuleNodeActions {
	onCreateChild: (parentId: string) => void;
	onDelete: (node: ModuleTreeNode) => void;
}

interface NodeMenuProps {
	actions: ModuleNodeActions;
	node: ModuleTreeNode;
	onRename: () => void;
}

function NodeMenu({ actions, node, onRename }: NodeMenuProps) {
	const createChild = useCallback(
		() => actions.onCreateChild(node.id),
		[actions, node.id]
	);
	const remove = useCallback(() => actions.onDelete(node), [actions, node]);

	return (
		<ContextMenuContent aria-label={`模块「${node.name}」操作`}>
			<ContextMenuItem onClick={onRename}>重命名</ContextMenuItem>
			<ContextMenuItem onClick={createChild}>新建子模块</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={remove} variant="destructive">
				删除
			</ContextMenuItem>
		</ContextMenuContent>
	);
}

function useContextMenuKey() {
	return useCallback((event: KeyboardEvent<HTMLDivElement>) => {
		if (!isContextMenuKey(event)) {
			return;
		}
		event.preventDefault();
		const row = event.currentTarget;
		const point = contextMenuPointFromRect(row.getBoundingClientRect());
		row.dispatchEvent(
			new MouseEvent("contextmenu", {
				bubbles: true,
				cancelable: true,
				clientX: point.x,
				clientY: point.y,
			})
		);
	}, []);
}

interface ModuleToggleProps {
	hasChildren: boolean;
	open: boolean;
}

function ModuleToggle({ hasChildren, open }: ModuleToggleProps) {
	return (
		<CollapsibleTrigger
			render={
				<Button
					aria-label={open ? "折叠" : "展开"}
					className={cn(!hasChildren && "invisible")}
					size="icon-xs"
					variant="ghost"
				>
					<ChevronRightIcon
						className={cn("transition-transform", open && "rotate-90")}
					/>
				</Button>
			}
		/>
	);
}

interface ModuleNodeRowProps {
	actions: ModuleNodeActions;
	depth: number;
	editing: boolean;
	hasChildren: boolean;
	node: ModuleTreeNode;
	onStartRename: () => void;
	onStopRename: () => void;
	open: boolean;
	selected: boolean;
}

function useScrollSelectedIntoView(selected: boolean) {
	const rowRef = useRef<HTMLElement | null>(null);
	useEffect(() => {
		if (selected) {
			rowRef.current?.scrollIntoView({ block: "nearest" });
		}
	}, [selected]);
	return rowRef;
}

export function ModuleNodeRow(props: ModuleNodeRowProps) {
	const { actions, depth, editing, hasChildren, node, open, selected } = props;
	const drag = useModuleRowDrag(node.id);
	const drop = useModuleRowDrop(node.id);
	const rowRef = useScrollSelectedIntoView(selected);
	const setRowRef = useCallback(
		(element: HTMLElement | null) => {
			rowRef.current = element;
			drag.setRowRef(element);
		},
		[drag.setRowRef, rowRef]
	);
	const handleContextMenuKey = useContextMenuKey();

	return (
		<ContextMenu>
			<ContextMenuTrigger
				className={cn(
					"group/module-row relative flex items-center gap-1 rounded-md px-2 py-0.5 before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-foreground",
					selected
						? "bg-sidebar-selected before:opacity-100"
						: "before:opacity-0 hover:bg-sidebar-accent",
					!selected && "data-popup-open:bg-sidebar-accent",
					drag.isDragging && "opacity-50"
				)}
				onKeyDown={handleContextMenuKey}
				render={<div ref={setRowRef} />}
			>
				<ModuleDragHandle drag={drag} name={node.name} />
				<ModuleToggle hasChildren={hasChildren} open={open} />
				<div
					className={cn(
						"flex min-w-0 flex-1 items-center",
						drop.insideClassName
					)}
					ref={drop.setNodeRef}
				>
					{editing ? (
						<ModuleRenameInput node={node} onDone={props.onStopRename} />
					) : (
						<ModuleNodeLink depth={depth} node={node} />
					)}
				</div>
				<ModuleMindmapLink node={node} />
			</ContextMenuTrigger>
			<NodeMenu actions={actions} node={node} onRename={props.onStartRename} />
		</ContextMenu>
	);
}
