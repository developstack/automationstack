import type { NodeObj } from "mind-elixir";

import { getEntityNodeRef, getMindmapNodeRef } from "./mindmap-adapter.ts";
import {
	escapesMindmapScope,
	isMindmapScopeRoot,
	isScopedMindmap,
	type MindmapScope,
} from "./mindmap-scope.ts";

/**
 * 右键菜单各项的元素 id。新建用例和重命名是 extend 项，mind-elixir 用 name 作为它们的元素 id；
 * 其余是 mind-elixir 的内置项。
 */
export const MINDMAP_MENU_ITEM = {
	addChild: "cm-add_child",
	addSibling: "cm-add_sibling",
	cancelFocus: "cm-unfucus",
	createCase: "新建用例",
	focus: "cm-fucus",
	moveDown: "cm-down",
	moveUp: "cm-up",
	remove: "cm-remove_child",
	rename: "重命名",
} as const;

export type MindmapMenuItemId =
	(typeof MINDMAP_MENU_ITEM)[keyof typeof MINDMAP_MENU_ITEM];

export interface MindmapMenuContext {
	/** 画布当前显示的根节点：平时是项目根，专注模式下是专注的节点 */
	displayRoot: NodeObj;
	focusMode: boolean;
	/** 右键的节点（mind-elixir 的 currentNode） */
	node: NodeObj;
	scope: MindmapScope;
	/** 当前选中的全部节点，删除作用于它们 */
	selected: readonly NodeObj[];
}

export type MindmapMoveDirection = -1 | 1;

/** 与 createMindmapGuards 的 addChild 规则相同：模块下，或全量脑图的项目根下 */
function canAddMindmapChild(node: NodeObj, scope: MindmapScope): boolean {
	const kind = getMindmapNodeRef(node)?.kind;
	return kind === "module" || (kind === "project" && !isScopedMindmap(scope));
}

/** 与 insertSibling 规则相同：模块或用例，且不会挂到只看一个模块时的项目根下 */
function canInsertMindmapSibling(node: NodeObj, scope: MindmapScope): boolean {
	if (getEntityNodeRef(node) === null || node.parent === undefined) {
		return false;
	}
	const parentKind = getMindmapNodeRef(node.parent)?.kind;
	return parentKind !== undefined && !escapesMindmapScope(scope, parentKind);
}

/** 与 removeNodes 规则相同：全部是模块或用例，且不含只看一个模块时的根模块 */
function canRemoveMindmapNodes(
	nodes: readonly NodeObj[],
	scope: MindmapScope
): boolean {
	return (
		nodes.length > 0 &&
		nodes.every((node) => {
			const ref = getMindmapNodeRef(node);
			return (
				getEntityNodeRef(node) !== null &&
				ref !== null &&
				!isMindmapScopeRoot(scope, ref)
			);
		})
	);
}

/**
 * mind-elixir 上移或下移时，把节点移到紧邻的同级节点前后。服务端分别保存模块和用例的顺序，
 * 模块总在用例前面，所以只有紧邻的节点与它同类时，移动才能保存。
 */
export function canMoveMindmapNode(
	node: NodeObj,
	direction: MindmapMoveDirection
): boolean {
	const ref = getEntityNodeRef(node);
	const siblings = node.parent?.children ?? [];
	const index = siblings.findIndex((sibling) => sibling.id === node.id);
	const neighbor = index < 0 ? undefined : siblings[index + direction];
	return (
		ref !== null &&
		neighbor !== undefined &&
		getEntityNodeRef(neighbor)?.kind === ref.kind
	);
}

/** 当前节点能用的菜单项；空集表示不打开菜单 */
export function listMindmapMenuItems(
	context: MindmapMenuContext
): ReadonlySet<MindmapMenuItemId> {
	const { node, scope } = context;
	// mind-elixir 在显示的根节点上不执行插入同级、删除、专注和移动
	const onBranch = node.id !== context.displayRoot.id;
	const usable: Record<MindmapMenuItemId, boolean> = {
		[MINDMAP_MENU_ITEM.addChild]: canAddMindmapChild(node, scope),
		[MINDMAP_MENU_ITEM.addSibling]:
			onBranch && canInsertMindmapSibling(node, scope),
		[MINDMAP_MENU_ITEM.remove]:
			onBranch && canRemoveMindmapNodes(context.selected, scope),
		[MINDMAP_MENU_ITEM.focus]: onBranch,
		[MINDMAP_MENU_ITEM.cancelFocus]: context.focusMode,
		[MINDMAP_MENU_ITEM.moveUp]: onBranch && canMoveMindmapNode(node, -1),
		[MINDMAP_MENU_ITEM.moveDown]: onBranch && canMoveMindmapNode(node, 1),
		[MINDMAP_MENU_ITEM.createCase]: getMindmapNodeRef(node)?.kind === "module",
		[MINDMAP_MENU_ITEM.rename]: getEntityNodeRef(node) !== null,
	};
	return new Set(
		Object.values(MINDMAP_MENU_ITEM).filter((item) => usable[item])
	);
}
