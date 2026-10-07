import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";

export type ModuleDropZone = "before" | "inside" | "root-end";

export interface ModuleDropPoint {
	moduleId: string | null;
	zone: ModuleDropZone;
}

export const ROOT_END_DROP_ID = "root-end";

export const CYCLE_DROP_MESSAGE = "非法移动：不能把模块拖到它自己的子模块下";

const ID_SEPARATOR = ":";

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

function siblingsOf(
	tree: readonly ModuleTreeNode[],
	parentId: string | null
): readonly ModuleTreeNode[] {
	if (parentId === null) {
		return tree;
	}
	return findModuleNode(tree, parentId)?.children ?? [];
}

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
