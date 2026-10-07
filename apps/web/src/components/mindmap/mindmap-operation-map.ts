import type { NodeObj, Operation } from "mind-elixir";

import type { client } from "@/utils/orpc";

import {
	getContainerNodeRef,
	getEntityNodeRef,
	getMindmapNodeRef,
} from "./mindmap-adapter.ts";
import type { MindmapNodeKind } from "./mindmap-node-id.ts";

type BatchInput = Parameters<typeof client.mindmap.batch>[0];

export type MindmapBatchOperation = BatchInput["operations"][number];

export type ResolveEntityId = (id: string) => string;

export interface MindmapOperationPlan {
	readonly created: { readonly nodeId: string; readonly tempId: string } | null;
	readonly keys: readonly string[];
	readonly toOperations: (
		resolveId: ResolveEntityId
	) => MindmapBatchOperation[];
}

const MOVE_NAMES = new Set(["moveNodeAfter", "moveNodeBefore", "moveNodeIn"]);

function siblingIndex(node: NodeObj, kind: MindmapNodeKind): number {
	let index = 0;
	for (const sibling of node.parent?.children ?? []) {
		if (sibling.id === node.id) {
			return index;
		}
		if (getMindmapNodeRef(sibling)?.kind === kind) {
			index += 1;
		}
	}
	return index;
}

function planCreate(
	node: NodeObj,
	projectId: string
): MindmapOperationPlan | null {
	const ref = getEntityNodeRef(node);
	const parent = node.parent ? getContainerNodeRef(node.parent) : null;
	if (ref === null || parent === null) {
		return null;
	}
	const index = siblingIndex(node, ref.kind);
	const created = { nodeId: node.id, tempId: ref.id };
	const keys = [ref.id, parent.id];
	if (ref.kind === "case") {
		return parent.kind === "module"
			? {
					created,
					keys,
					toOperations: (resolveId) => [
						{
							index,
							moduleId: resolveId(parent.id),
							name: node.topic,
							op: "createCase",
							projectId,
							tempId: ref.id,
						},
					],
				}
			: null;
	}
	return {
		created,
		keys,
		toOperations: (resolveId) => [
			{
				index,
				name: node.topic,
				op: "createModule",
				parentId: parent.kind === "project" ? null : resolveId(parent.id),
				projectId,
				tempId: ref.id,
			},
		],
	};
}

function planRename(node: NodeObj): MindmapOperationPlan | null {
	const ref = getEntityNodeRef(node);
	if (ref === null) {
		return null;
	}
	const name = node.topic;
	return {
		created: null,
		keys: [ref.id],
		toOperations: (resolveId) => [
			ref.kind === "module"
				? { id: resolveId(ref.id), name, op: "renameModule" }
				: { id: resolveId(ref.id), name, op: "renameCase" },
		],
	};
}

function planRemove(nodes: readonly NodeObj[]): MindmapOperationPlan | null {
	const refs = nodes.flatMap((node) => getEntityNodeRef(node) ?? []);
	if (refs.length === 0) {
		return null;
	}
	return {
		created: null,
		keys: refs.map((ref) => ref.id),
		toOperations: (resolveId) =>
			refs.map((ref) =>
				ref.kind === "module"
					? { id: resolveId(ref.id), op: "removeModule" }
					: { id: resolveId(ref.id), op: "removeCase" }
			),
	};
}

function toMoveOperation(
	node: NodeObj,
	resolveId: ResolveEntityId
): MindmapBatchOperation[] {
	const ref = getEntityNodeRef(node);
	const parent = node.parent ? getContainerNodeRef(node.parent) : null;
	if (ref === null || parent === null) {
		return [];
	}
	const index = siblingIndex(node, ref.kind);
	if (ref.kind === "module") {
		return [
			{
				id: resolveId(ref.id),
				index,
				op: "moveModule",
				parentId: parent.kind === "project" ? null : resolveId(parent.id),
			},
		];
	}
	return parent.kind === "module"
		? [
				{
					id: resolveId(ref.id),
					index,
					moduleId: resolveId(parent.id),
					op: "moveCase",
				},
			]
		: [];
}

function planMove(nodes: readonly NodeObj[]): MindmapOperationPlan | null {
	const keys = nodes.flatMap((node) => getEntityNodeRef(node)?.id ?? []);
	if (keys.length === 0) {
		return null;
	}
	const parentKeys = nodes.flatMap(
		(node) => (node.parent ? getContainerNodeRef(node.parent)?.id : null) ?? []
	);
	return {
		created: null,
		keys: [...keys, ...parentKeys],
		toOperations: (resolveId) =>
			nodes.flatMap((node) => toMoveOperation(node, resolveId)),
	};
}

export function planMindmapOperation(
	operation: Operation,
	projectId: string
): MindmapOperationPlan | null {
	if ("objs" in operation) {
		if (operation.name === "removeNodes") {
			return planRemove(operation.objs);
		}
		return MOVE_NAMES.has(operation.name) ? planMove(operation.objs) : null;
	}
	if (operation.name === "addChild" || operation.name === "insertSibling") {
		return planCreate(operation.obj, projectId);
	}
	return operation.name === "finishEdit" ? planRename(operation.obj) : null;
}
