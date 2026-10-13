import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { Button } from "@automationstack/ui/components/button";
import { CollapsibleTrigger } from "@automationstack/ui/components/collapsible";
import {
	ContextMenu,
	ContextMenuTrigger,
} from "@automationstack/ui/components/context-menu";
import { cn } from "@automationstack/ui/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef } from "react";
import { ModuleContextMenuContent } from "@/components/workspace/module-context-menu-content";
import { ModuleDragHandle } from "@/components/workspace/module-drag-handle";
import {
	type ModuleRowDrag,
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
import { ModuleRowMenu } from "@/components/workspace/module-row-menu";
import type { ModuleTreeEditing } from "@/components/workspace/use-module-tree-edit";

/**
 * 行尾的操作按钮平时隐藏，鼠标悬停、键盘焦点在行内、菜单打开时显示。
 * 触摸屏没有悬停，所以一直显示。
 */
const ROW_ACTIONS_CLASS =
	"flex shrink-0 items-center pe-1 opacity-0 transition-opacity group-hover/module-row:opacity-100 group-focus-within/module-row:opacity-100 group-has-[[data-popup-open]]/module-row:opacity-100 pointer-coarse:opacity-100";

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
	name: string;
	open: boolean;
}

function ModuleToggle({ hasChildren, name, open }: ModuleToggleProps) {
	return (
		<CollapsibleTrigger
			render={
				<Button
					aria-label={`${open ? "折叠" : "展开"}模块「${name}」`}
					className={cn("text-muted-foreground", !hasChildren && "invisible")}
					size="icon-xs"
					variant="ghost"
				>
					<ChevronRightIcon
						aria-hidden="true"
						className={cn(
							"transition-transform duration-150 ease-out",
							open && "rotate-90"
						)}
					/>
				</Button>
			}
		/>
	);
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

function useRowDragAndScroll(moduleId: string, selected: boolean) {
	const drag = useModuleRowDrag(moduleId);
	const rowRef = useScrollSelectedIntoView(selected);
	const setRowRef = useCallback(
		(element: HTMLElement | null) => {
			rowRef.current = element;
			drag.setRowRef(element);
		},
		[drag.setRowRef, rowRef]
	);
	return { drag, setRowRef };
}

function useRowActions(node: ModuleTreeNode, editing: ModuleTreeEditing) {
	const { startCreate, requestDelete, startRename } = editing;
	const onRename = useCallback(
		() => startRename(node.id),
		[node.id, startRename]
	);
	const onCreateChild = useCallback(
		() => startCreate(node.id),
		[node.id, startCreate]
	);
	const onDelete = useCallback(
		() => requestDelete(node),
		[node, requestDelete]
	);
	return { name: node.name, onCreateChild, onDelete, onRename };
}

interface ModuleNodeRowProps {
	depth: number;
	editing: ModuleTreeEditing;
	hasChildren: boolean;
	node: ModuleTreeNode;
	open: boolean;
	renaming: boolean;
	selected: boolean;
}

interface ModuleRowMainProps extends ModuleNodeRowProps {
	actions: ReturnType<typeof useRowActions>;
	drag: ModuleRowDrag;
}

/** 行的主体：拖拽手柄、展开按钮和名称。右键或按菜单键在这里打开模块菜单。 */
function ModuleRowMain(props: ModuleRowMainProps) {
	const { actions, drag, editing, node, renaming } = props;
	const drop = useModuleRowDrop(node.id);
	const handleContextMenuKey = useContextMenuKey();

	return (
		<ContextMenu disabled={renaming}>
			<ContextMenuTrigger
				className="flex min-w-0 flex-1 items-center gap-1 py-0.5 ps-1"
				onKeyDown={handleContextMenuKey}
			>
				<ModuleDragHandle drag={drag} name={node.name} />
				<ModuleToggle
					hasChildren={props.hasChildren}
					name={node.name}
					open={props.open}
				/>
				<div
					className={cn(
						"flex min-w-0 flex-1 items-center rounded-sm",
						drop.insideClassName
					)}
					ref={drop.setNodeRef}
				>
					{renaming ? (
						<ModuleRenameInput node={node} onDone={editing.stop} />
					) : (
						<ModuleNodeLink
							depth={props.depth}
							node={node}
							selected={props.selected}
						/>
					)}
				</div>
			</ContextMenuTrigger>
			<ModuleContextMenuContent {...actions} />
		</ContextMenu>
	);
}

/**
 * 模块树的一行。选中的行有底色、左侧竖线和加粗的名称。
 * 右键、菜单键或行尾的「更多操作」打开同一个菜单。
 * 行尾的按钮不放在右键菜单的触发区域内：「更多操作」菜单的事件会经过 React 冒泡到触发区域，
 * 在菜单中右键或长按会同时打开右键菜单。
 */
export function ModuleNodeRow(props: ModuleNodeRowProps) {
	const { editing, node, renaming, selected } = props;
	const { drag, setRowRef } = useRowDragAndScroll(node.id, selected);
	const actions = useRowActions(node, editing);

	return (
		<div
			className={cn(
				"group/module-row relative flex min-h-8 items-center rounded-md transition-control",
				"before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-foreground before:transition-opacity",
				selected
					? "bg-sidebar-selected before:opacity-100"
					: "before:opacity-0 hover:bg-sidebar-accent has-[[data-popup-open]]:bg-sidebar-accent",
				drag.isDragging && "opacity-50"
			)}
			ref={setRowRef}
		>
			<ModuleRowMain {...props} actions={actions} drag={drag} />
			{renaming ? null : (
				<div className={ROW_ACTIONS_CLASS}>
					<ModuleMindmapLink node={node} />
					<ModuleRowMenu {...actions} />
				</div>
			)}
		</div>
	);
}
