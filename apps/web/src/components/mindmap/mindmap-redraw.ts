import type {
	MindElixirData,
	MindElixirInstance,
	NodeObj,
	Topic,
} from "mind-elixir";

import { isCaseNodeId } from "./mindmap-node-id.ts";
import { findTopic } from "./mindmap-node-utils.ts";

export interface MindmapViewState {
	expandedCaseIds: readonly string[];
	selectedNodeIds: readonly string[];
}

export interface MindmapRedrawResult {
	droppedExpandedCases: number;
}

function collectExpandedCaseIds(node: NodeObj, into: string[]): void {
	if (node.expanded === true && isCaseNodeId(node.id)) {
		into.push(node.id);
	}
	for (const child of node.children ?? []) {
		collectExpandedCaseIds(child, into);
	}
}

export function captureMindmapViewState(
	mind: MindElixirInstance
): MindmapViewState {
	const expandedCaseIds: string[] = [];
	collectExpandedCaseIds(mind.nodeData, expandedCaseIds);
	return {
		expandedCaseIds,
		selectedNodeIds: mind.currentNodes.map((topic) => topic.nodeObj.id),
	};
}

function collectById(
	node: NodeObj,
	wanted: ReadonlySet<string>,
	into: NodeObj[]
): void {
	if (wanted.has(node.id) && (node.children?.length ?? 0) > 0) {
		into.push(node);
	}
	for (const child of node.children ?? []) {
		collectById(child, wanted, into);
	}
}

export function applyExpandedCases(
	nodeData: NodeObj,
	caseIds: readonly string[],
	limit: number
): number {
	if (caseIds.length === 0) {
		return 0;
	}
	const matches: NodeObj[] = [];
	collectById(nodeData, new Set(caseIds), matches);
	const allowed = Math.max(Math.min(limit, matches.length), 0);
	for (const node of matches.slice(0, allowed)) {
		node.expanded = true;
	}
	return matches.length - allowed;
}

function restoreSelection(
	mind: MindElixirInstance,
	nodeIds: readonly string[]
): void {
	const topics: Topic[] = [];
	for (const nodeId of nodeIds) {
		const topic = findTopic(mind, nodeId);
		if (topic !== null) {
			topics.push(topic);
		}
	}
	if (topics.length > 0) {
		mind.selectNodes(topics);
	}
}

export function redrawMindmap(
	mind: MindElixirInstance,
	data: MindElixirData,
	expandedCaseAllowance: number
): MindmapRedrawResult {
	const state = captureMindmapViewState(mind);
	const droppedExpandedCases = applyExpandedCases(
		data.nodeData,
		state.expandedCaseIds,
		expandedCaseAllowance
	);
	mind.nodeData = data.nodeData;
	mind.refresh();
	restoreSelection(mind, state.selectedNodeIds);
	return { droppedExpandedCases };
}
