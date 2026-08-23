/**
 * `before` hooks for the mindmap canvas.
 *
 * mind-elixir runs every node operation through `before[name]` and skips it
 * when the hook resolves to `false` (see `MindElixir.js`:
 * `o && !await o.apply(this, n) || e.apply(this, n)`), so a veto here means the
 * canvas never applies the edit — no rollback, no rebuild. Hooks receive the
 * `operation` arguments (`Topic` elements), not `NodeObj`s, and may be async,
 * which is what the delete confirmation relies on.
 *
 * v1 capabilities disabled here (no matching `mindmap.batch` operation, so they
 * could never be mirrored to the server): insert-parent, copy/paste of nodes,
 * node reshaping (icons / hyperlinks / images / styles) and multi-select batch
 * drag. Undo/redo is disabled through `allowUndo: false` in the canvas options.
 */
import type { Before, MindElixirInstance, NodeObj, Topic } from "mind-elixir";

import {
	canHaveChildren,
	getEntityNodeRef,
	getMindmapNodeRef,
	type MindmapEntityRef,
} from "./mindmap-adapter.ts";
import {
	isStepNodeRef,
	type MindmapEntityNodeRef,
	type MindmapNodeKind,
} from "./mindmap-node-id.ts";
import {
	escapesMindmapScope,
	isMindmapScopeRoot,
	MINDMAP_SCOPE_ESCAPE_MESSAGE,
	MINDMAP_SCOPE_ROOT_REMOVE_MESSAGE,
	type MindmapScope,
} from "./mindmap-scope.ts";

export interface MindmapGuardHost {
	/** Resolves true once the user confirmed the deletion. */
	confirmRemoval: (nodes: readonly NodeObj[]) => Promise<boolean>;
	/** The live instance, needed for the keyboard shortcuts that pass no node. */
	getInstance: () => MindElixirInstance | null;
	/** Double-click on a case node opens its detail in the list view instead. */
	openCase: (caseId: string) => void;
	/** User-facing reason why the operation was refused. */
	reject: (message: string) => void;
	/** 当前画布看的是整个项目还是某个模块子树，见 mindmap-scope.ts。 */
	scope: MindmapScope;
	/** Kind of the node mind-elixir is about to create (Tab / Enter). */
	setPendingKind: (kind: MindmapEntityRef["kind"]) => void;
}

const CASE_LEAF_MESSAGE = "用例节点不能包含子节点";
const ROOT_MESSAGE = "项目根节点不支持该操作";
/**
 * Step / expected nodes mirror the case's `steps` jsonb, and `mindmap.batch`
 * has no operation for it — editing one on the canvas would mean read-modify-
 * write of the whole array plus the optimistic lock. v1 sends users to the
 * case detail instead, and every guard below refuses these nodes outright.
 */
export const STEP_READONLY_MESSAGE = "步骤与预期请在用例详情中编辑";
const CASE_PARENT_MESSAGE = "用例只能挂在模块下";
const CYCLE_MESSAGE = "不能把模块移动到它自己的子节点下";
const MULTI_DRAG_MESSAGE = "暂不支持多选批量拖拽";

function resolveTarget(host: MindmapGuardHost, el?: Topic): Topic | null {
	return el ?? host.getInstance()?.currentNode ?? null;
}

function deny(host: MindmapGuardHost, message: string): () => boolean {
	return () => {
		host.reject(message);
		return false;
	};
}

function isDescendantOf(node: NodeObj, ancestorId: string): boolean {
	let cursor: NodeObj | undefined = node;
	while (cursor !== undefined) {
		if (cursor.id === ancestorId) {
			return true;
		}
		cursor = cursor.parent;
	}
	return false;
}

/** 新节点会挂到 `parentKind` 下：作用域视图里落到项目根就等于消失。 */
function guardScopeEscape(
	host: MindmapGuardHost,
	parentKind: MindmapNodeKind
): boolean {
	if (escapesMindmapScope(host.scope, parentKind)) {
		host.reject(MINDMAP_SCOPE_ESCAPE_MESSAGE);
		return false;
	}
	return true;
}

function guardAddChild(host: MindmapGuardHost, el?: Topic): boolean {
	const target = resolveTarget(host, el);
	const ref = target === null ? null : getMindmapNodeRef(target.nodeObj);
	if (ref === null) {
		return false;
	}
	if (isStepNodeRef(ref)) {
		host.reject(STEP_READONLY_MESSAGE);
		return false;
	}
	if (ref.kind === "case") {
		host.reject(CASE_LEAF_MESSAGE);
		return false;
	}
	// addChild 的父级就是选中的节点本身。
	if (!guardScopeEscape(host, ref.kind)) {
		return false;
	}
	host.setPendingKind("module");
	return true;
}

function guardInsertSibling(host: MindmapGuardHost, el?: Topic): boolean {
	const target = resolveTarget(host, el);
	if (target === null) {
		return false;
	}
	const ref = getMindmapNodeRef(target.nodeObj);
	if (ref === null) {
		return false;
	}
	if (isStepNodeRef(ref)) {
		host.reject(STEP_READONLY_MESSAGE);
		return false;
	}
	if (ref.kind === "project") {
		host.reject(ROOT_MESSAGE);
		return false;
	}
	// 兄弟节点的父级是选中节点的父级；作用域根的父级正是那个假的项目根。
	const { parent } = target.nodeObj;
	const parentKind =
		parent === undefined ? undefined : getMindmapNodeRef(parent)?.kind;
	if (parentKind !== undefined && !guardScopeEscape(host, parentKind)) {
		return false;
	}
	host.setPendingKind(ref.kind);
	return true;
}

function guardRemove(
	host: MindmapGuardHost,
	tpcs: readonly Topic[]
): Promise<boolean> {
	const nodes = tpcs.map((tpc) => tpc.nodeObj);
	if (nodes.length === 0) {
		return Promise.resolve(false);
	}
	const refs = nodes.map((node) => getMindmapNodeRef(node));
	if (refs.some((ref) => ref !== null && isStepNodeRef(ref))) {
		host.reject(STEP_READONLY_MESSAGE);
		return Promise.resolve(false);
	}
	if (nodes.some((node) => getEntityNodeRef(node) === null)) {
		host.reject(ROOT_MESSAGE);
		return Promise.resolve(false);
	}
	if (refs.some((ref) => ref !== null && isMindmapScopeRoot(host.scope, ref))) {
		host.reject(MINDMAP_SCOPE_ROOT_REMOVE_MESSAGE);
		return Promise.resolve(false);
	}
	return host.confirmRemoval(nodes);
}

/** Validates the drop target of a move once the moved node is known. */
function guardDropTarget(
	host: MindmapGuardHost,
	moved: NodeObj,
	movedRef: MindmapEntityNodeRef,
	target: NodeObj
): boolean {
	const parentRef = getMindmapNodeRef(target);
	if (parentRef === null) {
		return false;
	}
	if (isStepNodeRef(parentRef)) {
		host.reject(STEP_READONLY_MESSAGE);
		return false;
	}
	if (!canHaveChildren(target)) {
		host.reject(CASE_LEAF_MESSAGE);
		return false;
	}
	// 拖出当前模块（落到项目根下）等于把节点移出作用域，它会当场消失。
	if (!guardScopeEscape(host, parentRef.kind)) {
		return false;
	}
	if (movedRef.kind === "case" && parentRef.kind !== "module") {
		host.reject(CASE_PARENT_MESSAGE);
		return false;
	}
	if (isDescendantOf(target, moved.id)) {
		host.reject(CYCLE_MESSAGE);
		return false;
	}
	return true;
}

function guardMove(
	host: MindmapGuardHost,
	from: readonly Topic[],
	target: NodeObj | undefined
): boolean {
	if (from.length > 1) {
		host.reject(MULTI_DRAG_MESSAGE);
		return false;
	}
	const moved = from.at(0)?.nodeObj;
	if (moved === undefined || target === undefined) {
		return false;
	}
	const movedRef = getMindmapNodeRef(moved);
	if (movedRef === null) {
		return false;
	}
	if (isStepNodeRef(movedRef)) {
		host.reject(STEP_READONLY_MESSAGE);
		return false;
	}
	if (movedRef.kind === "project") {
		host.reject(ROOT_MESSAGE);
		return false;
	}
	return guardDropTarget(host, moved, movedRef, target);
}

/**
 * Double-click (and F2) enters edit mode through `beginEdit`; case nodes open
 * their detail instead. Renaming a case stays available from the context menu,
 * which calls `editTopic` directly — that path bypasses `before` by design.
 */
function guardBeginEdit(host: MindmapGuardHost, el?: Topic): boolean {
	const target = resolveTarget(host, el);
	const ref = target === null ? null : getMindmapNodeRef(target.nodeObj);
	if (ref === null) {
		return false;
	}
	if (isStepNodeRef(ref)) {
		host.reject(STEP_READONLY_MESSAGE);
		return false;
	}
	if (ref.kind === "case") {
		host.openCase(ref.id);
		return false;
	}
	return ref.kind === "module";
}

/** Builds the `Options.before` map wired to one canvas session. */
export function createMindmapGuards(host: MindmapGuardHost): Before {
	return {
		addChild: (el) => guardAddChild(host, el),
		beginEdit: (el) => guardBeginEdit(host, el),
		copyNode: deny(host, "暂不支持复制节点"),
		copyNodes: deny(host, "暂不支持复制节点"),
		insertParent: deny(host, "暂不支持插入父节点"),
		insertSibling: (_type, el) => guardInsertSibling(host, el),
		moveNodeAfter: (from, to) => guardMove(host, from, to.nodeObj.parent),
		moveNodeBefore: (from, to) => guardMove(host, from, to.nodeObj.parent),
		moveNodeIn: (from, to) => guardMove(host, from, to.nodeObj),
		removeNodes: (tpcs) => guardRemove(host, tpcs),
		reshapeNode: deny(host, "暂不支持修改节点样式"),
	};
}
