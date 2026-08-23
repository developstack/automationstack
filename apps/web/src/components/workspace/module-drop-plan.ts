/**
 * 模块树拖拽的纯逻辑层：落点 id 编解码 + 「落点 → 服务端动作」解析。
 *
 * 这里不依赖 React 与 dnd-kit，便于单独推理：
 * - 落到某个模块「上」= 改挂父级（modules.move）
 * - 落到两个同级模块「之间」= 同级重排（modules.reorder）或跨级插入（modules.move + index）
 * - 拖进自身子孙 = 前端先拦截（服务端也有环检测，但不应让用户看到 500/400 才知道）
 */
import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";

/** 落点种类：before = 插到该模块之前；inside = 挂到该模块之下；root-end = 根层级末尾。 */
export type ModuleDropZone = "before" | "inside" | "root-end";

export interface ModuleDropPoint {
	/** root-end 落点没有目标模块。 */
	moduleId: string | null;
	zone: ModuleDropZone;
}

export const ROOT_END_DROP_ID = "root-end";

export const CYCLE_DROP_MESSAGE = "非法移动：不能把模块拖到它自己的子模块下";

const ID_SEPARATOR = ":";

/** dnd-kit 的 droppable id，用前缀区分落点种类。 */
export function makeDropId(
	zone: "before" | "inside",
	moduleId: string
): string {
	return `${zone}${ID_SEPARATOR}${moduleId}`;
}

export function parseDropId(raw: string): ModuleDropPoint | null {
	if (raw === ROOT_END_DROP_ID) {
		return { moduleId: null, zone: "root-end" };
	}
	const separator = raw.indexOf(ID_SEPARATOR);
	if (separator === -1) {
		return null;
	}
	const zone = raw.slice(0, separator);
	if (zone !== "before" && zone !== "inside") {
		return null;
	}
	return { moduleId: raw.slice(separator + 1), zone };
}

export type ModuleDropAction =
	| { kind: "invalid"; reason: string }
	| { index?: number; kind: "move"; moduleId: string; parentId: string | null }
	| { kind: "noop" }
	| { kind: "reorder"; orderedIds: string[]; parentId: string | null };

const NOOP: ModuleDropAction = { kind: "noop" };
const CYCLE: ModuleDropAction = { kind: "invalid", reason: CYCLE_DROP_MESSAGE };

export function findModuleNode(
	nodes: readonly ModuleTreeNode[],
	id: string
): ModuleTreeNode | null {
	for (const node of nodes) {
		if (node.id === id) {
			return node;
		}
		const found = findModuleNode(node.children, id);
		if (found) {
			return found;
		}
	}
	return null;
}

/** 同级组：parentId 为 null 时是根层级。 */
function siblingsOf(
	tree: readonly ModuleTreeNode[],
	parentId: string | null
): readonly ModuleTreeNode[] {
	if (parentId === null) {
		return tree;
	}
	return findModuleNode(tree, parentId)?.children ?? [];
}

/** 只含子孙，不含自身。 */
function descendantIds(node: ModuleTreeNode): Set<string> {
	const collected = new Set<string>();
	const queue = [...node.children];
	while (queue.length > 0) {
		const current = queue.pop();
		if (current === undefined) {
			break;
		}
		collected.add(current.id);
		queue.push(...current.children);
	}
	return collected;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length &&
		left.every((id, index) => id === right[index])
	);
}

/** 把 active 插到同级组里 targetId 之前，返回完整的新顺序。 */
function reorderBefore(
	siblings: readonly ModuleTreeNode[],
	activeId: string,
	targetId: string,
	parentId: string | null
): ModuleDropAction {
	const remaining = siblings
		.map((node) => node.id)
		.filter((id) => id !== activeId);
	const at = remaining.indexOf(targetId);
	if (at === -1) {
		return NOOP;
	}
	const ordered = [...remaining.slice(0, at), activeId, ...remaining.slice(at)];
	if (
		sameOrder(
			ordered,
			siblings.map((node) => node.id)
		)
	) {
		return NOOP;
	}
	return { kind: "reorder", orderedIds: ordered, parentId };
}

function resolveBefore(
	tree: readonly ModuleTreeNode[],
	active: ModuleTreeNode,
	target: ModuleTreeNode
): ModuleDropAction {
	if (target.id === active.id) {
		return NOOP;
	}
	const { parentId } = target;
	// parentId === active.id 是「落到自己的直接子节点之前」：descendantIds 只含子孙、
	// 不含自身，光查子孙会漏掉这一层，最终把 active 挂到 active 自己名下。
	const intoSelf =
		parentId !== null &&
		(parentId === active.id || descendantIds(active).has(parentId));
	if (intoSelf) {
		return CYCLE;
	}
	const siblings = siblingsOf(tree, parentId);
	if (active.parentId === parentId) {
		return reorderBefore(siblings, active.id, target.id, parentId);
	}
	return {
		index: siblings.findIndex((node) => node.id === target.id),
		kind: "move",
		moduleId: active.id,
		parentId,
	};
}

function resolveInside(
	active: ModuleTreeNode,
	target: ModuleTreeNode
): ModuleDropAction {
	// active.parentId === target.id 是「拖到自己当前的父节点上」：不早退的话会
	// 发出不带 index 的 move，服务端 clampIndex(undefined, total) 把它写到同级
	// 末尾，产生用户没要求过的静默重排。
	if (target.id === active.id || active.parentId === target.id) {
		return NOOP;
	}
	if (descendantIds(active).has(target.id)) {
		return CYCLE;
	}
	return { kind: "move", moduleId: active.id, parentId: target.id };
}

function resolveRootEnd(
	tree: readonly ModuleTreeNode[],
	active: ModuleTreeNode
): ModuleDropAction {
	if (active.parentId !== null) {
		return { kind: "move", moduleId: active.id, parentId: null };
	}
	const ordered = [
		...tree.map((node) => node.id).filter((id) => id !== active.id),
		active.id,
	];
	if (
		sameOrder(
			ordered,
			tree.map((node) => node.id)
		)
	) {
		return NOOP;
	}
	return { kind: "reorder", orderedIds: ordered, parentId: null };
}

/** 把一次 dnd-kit 落点翻译成具体的 modules.move / modules.reorder 调用。 */
export function resolveModuleDrop(
	tree: readonly ModuleTreeNode[],
	activeId: string,
	drop: ModuleDropPoint
): ModuleDropAction {
	const active = findModuleNode(tree, activeId);
	if (!active) {
		return NOOP;
	}
	if (drop.zone === "root-end") {
		return resolveRootEnd(tree, active);
	}
	const target =
		drop.moduleId === null ? null : findModuleNode(tree, drop.moduleId);
	if (!target) {
		return NOOP;
	}
	return drop.zone === "inside"
		? resolveInside(active, target)
		: resolveBefore(tree, active, target);
}
