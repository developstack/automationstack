/**
 * 模块树里的一行本身（不含子树）。原与 ModuleNodeItem 同住 module-tree-node.tsx，
 * 按「一个文件一个对外组件」拆开：递归那一层留在 module-node-item.tsx，
 * 行内的右键菜单与展开箭头作为私有辅助跟着这一行搬到这里。
 */
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

/**
 * 模块行的操作菜单。只有菜单体，触发器是整行（见 ModuleNodeRow）。
 *
 * 原先是行尾一枚 hover 才显形的「⋯」按钮：它把同一行的脑图图标往左顶了
 * 28px（icon-xs 的 24px + 行内 gap-1 的 4px），使模块行的脑图与「模块」标题行
 * 右端那枚全项目脑图差了整整一档，侧栏右缘对不齐。改成右键菜单后行尾不再有
 * 按钮，各行的脑图自然收在同一条竖线上。
 */
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

/**
 * 键盘请求上下文菜单时，在行元素上补派发一个带坐标的 `contextmenu`。
 *
 * 刻意走原生事件而不是直接开菜单：ContextMenuTrigger 的锚点是在它自己的
 * onContextMenu 里按事件坐标 setAnchor 的，绕过这条路径菜单会锚在错误位置。
 * keydown 从行内已聚焦的 `<Link>` 冒泡上来即可，所以行本身不需要 tabIndex。
 */
function useContextMenuKey() {
	return useCallback((event: KeyboardEvent<HTMLDivElement>) => {
		if (!isContextMenuKey(event)) {
			return;
		}
		// Windows / Linux 上浏览器自己也会补一次原生 contextmenu，拦下来免得锚点设两遍。
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
					// invisible 而不是不渲染：没有子模块的行也要留下这一格，
					// 否则叶子行的模块名会比有子模块的行左移一整档。
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
	/** 只往下传给模块名链接选字号档位，行高与缩进不随深度变，见 module-node-link.tsx。 */
	depth: number;
	editing: boolean;
	hasChildren: boolean;
	node: ModuleTreeNode;
	onStartRename: () => void;
	onStopRename: () => void;
	open: boolean;
	selected: boolean;
}

/**
 * 深链（`?moduleId=…`）打开时，选中的模块可能在折叠层之下：祖先链由
 * useModuleExpansion 自动展开，这里负责把展开出来的那一行滚进视野。
 * `block: "nearest"` 只滚动必要的最近祖先容器，不会把整页拽走。
 */
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
		// 整行就是右键菜单的触发器。用 render 把它并进这个 div，而不是在外面再套一层：
		// 这个 div 上挂着 dnd-kit 的 setRowRef（拖拽碰撞矩形按行算），多一层会改掉布局与碰撞盒。
		<ContextMenu>
			<ContextMenuTrigger
				className={cn(
					// px-2：与 aside 的 p-2 相加正好是 16px 的侧栏 gutter，见 module-tree.tsx 顶部约定。
					// 行首第一个流内元素是展开箭头，所以模块行的内容正起于这条 16px 线，与
					// 「项目概览 / 测试评审和执行 / 未完成草稿」那几行的行首图标同起点；拖拽把手
					// 绝对定位、不占流内宽度（理由见 module-drag-handle.tsx），这个 relative 同时是它的包含块。
					// relative + before:*：选中态的左侧 2px 指示条，用伪元素而不是多一层子节点——
					// 这个 div 的碰撞盒是按行算的，加节点会改布局。内缩 4px 使条长 20px，与一级侧栏
					// 那条等长（行高 28px = py-0.5 + icon-xs 24px）；行没有 overflow-hidden，
					// 条端比 8px 的圆角弧多探出约 0.5px，被自身的 rounded-full 吃掉，看不出来。
					"group/module-row relative flex items-center gap-1 rounded-md px-2 py-0.5 before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-foreground",
					selected
						? "bg-sidebar-selected before:opacity-100"
						: "before:opacity-0 hover:bg-sidebar-accent",
					// 菜单开着时保持底色：否则右键之后指针一移开，就看不出菜单属于哪一行。
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
