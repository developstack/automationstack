/**
 * Canvas-node plumbing: minting ids for nodes mind-elixir created on its own
 * and swapping a temporary id for the one the server minted.
 *
 * mind-elixir stores a node id twice — on `NodeObj.id` and on the topic
 * element's `data-nodeid` attribute (`me<id>`, see `findEle` in
 * mind-elixir@5.15.1) — so both have to be rewritten together.
 */
import type { MindElixirInstance, NodeObj, Topic } from "mind-elixir";

import { buildPriorityTag, type MindmapNodeMeta } from "./mindmap-adapter.ts";
import {
	decodeMindmapNodeId,
	encodeCaseNodeId,
	encodeModuleNodeId,
	isStepNodeRef,
} from "./mindmap-node-id.ts";

/** Priority a case gets when created from the canvas (matches the db default). */
const DEFAULT_CASE_PRIORITY = "P2" as const;

export const NEW_MODULE_TOPIC = "新模块";
export const NEW_CASE_TOPIC = "新用例";

function mintTempId(): string {
	return `tmp_${crypto.randomUUID()}`;
}

/** `findEle` throws when the node is gone or collapsed; we only want null. */
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

/**
 * Gives a node mind-elixir just created (Tab / Enter) an id in our scheme so
 * the operation mapper can classify it. Returns false when the node already
 * carries one (e.g. the case node built by the context menu).
 */
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

/** Swaps the temporary node id for the real one once the server answered. */
export function applyRealNodeId(
	mind: MindElixirInstance,
	nodeId: string,
	realEntityId: string
): void {
	const ref = decodeMindmapNodeId(nodeId);
	// Step / expected nodes are generated, never created by the user, so they
	// never carry a temp id waiting for a server-minted one.
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

/** A fresh case node, ready to be handed to `mind.addChild(el, node)`. */
export function buildNewCaseNode(): NodeObj {
	const metadata: MindmapNodeMeta = { allowChildren: false, kind: "case" };
	return {
		id: encodeCaseNodeId(mintTempId()),
		metadata,
		tags: [buildPriorityTag(DEFAULT_CASE_PRIORITY)],
		topic: NEW_CASE_TOPIC,
	};
}
