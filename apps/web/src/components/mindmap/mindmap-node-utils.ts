import type { MindElixirInstance, NodeObj, Topic } from "mind-elixir";

import { buildPriorityTag, type MindmapNodeMeta } from "./mindmap-adapter.ts";
import {
	decodeMindmapNodeId,
	encodeCaseNodeId,
	encodeModuleNodeId,
	isStepNodeRef,
} from "./mindmap-node-id.ts";

const DEFAULT_CASE_PRIORITY = "P2" as const;

export const NEW_MODULE_TOPIC = "新模块";
export const NEW_CASE_TOPIC = "新用例";

function mintTempId(): string {
	return `tmp_${crypto.randomUUID()}`;
}

export function findTopic(
	mind: MindElixirInstance,
	nodeId: string
): Topic | null {
	try {
		return mind.findEle(nodeId);
	} catch {
		return null;
	}
}

function setNodeId(
	mind: MindElixirInstance,
	node: NodeObj,
	nextId: string
): void {
	const element = findTopic(mind, node.id);
	node.id = nextId;
	if (element) {
		element.nodeObj.id = nextId;
		element.dataset.nodeid = `me${nextId}`;
	}
}

export function adoptNewNode(
	mind: MindElixirInstance,
	node: NodeObj,
	kind: "case" | "module"
): boolean {
	if (decodeMindmapNodeId(node.id) !== null) {
		return false;
	}
	const tempId = mintTempId();
	const metadata: MindmapNodeMeta = {
		allowChildren: kind === "module",
		kind,
	};
	node.metadata = metadata;
	if (kind === "case") {
		node.tags = [buildPriorityTag(DEFAULT_CASE_PRIORITY)];
	}
	setNodeId(
		mind,
		node,
		kind === "case" ? encodeCaseNodeId(tempId) : encodeModuleNodeId(tempId)
	);
	return true;
}

export function applyRealNodeId(
	mind: MindElixirInstance,
	nodeId: string,
	realEntityId: string
): void {
	const ref = decodeMindmapNodeId(nodeId);
	if (ref === null || isStepNodeRef(ref) || ref.kind === "project") {
		return;
	}
	const element = findTopic(mind, nodeId);
	if (element === null) {
		return;
	}
	setNodeId(
		mind,
		element.nodeObj,
		ref.kind === "case"
			? encodeCaseNodeId(realEntityId)
			: encodeModuleNodeId(realEntityId)
	);
}

export function buildNewCaseNode(): NodeObj {
	const metadata: MindmapNodeMeta = { allowChildren: false, kind: "case" };
	return {
		id: encodeCaseNodeId(mintTempId()),
		metadata,
		tags: [buildPriorityTag(DEFAULT_CASE_PRIORITY)],
		topic: NEW_CASE_TOPIC,
	};
}
