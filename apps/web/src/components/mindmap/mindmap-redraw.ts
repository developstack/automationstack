/**
 * 一次画布重绘的机制，从 `MindmapSyncRunner` 里拆出来。
 *
 * mind-elixir@5.15.1 的 `refresh(data)`（MindElixir.js:817）是
 * `this.clearSelection(), e && (e = JSON.parse(JSON.stringify(e)), this.nodeData = e.nodeData, ...), Y(this.nodeData), this.layout(), this.linkDiv()`
 * 有两个对协作场景很不友好的细节：
 *
 * 1. **传参就会走一次 `JSON.parse(JSON.stringify())` 全量深拷贝**（T15 实测
 *    6000 条用例下约 70ms / 16%）。不传参这一段整个跳过 —— 所以这里自己把
 *    新树挂到 `mind.nodeData` 上，再调无参 `refresh()`。
 *    安全性前提：`toMindElixirData` 是纯函数，返回的每个节点都是新建的对象
 *    字面量，不共享 react-query 缓存里的任何对象，库随后往这些节点上写
 *    `parent` 反向指针也污染不到缓存。
 *
 * 2. **第一行就是 `clearSelection()`**：队友每保存一次，本地用户的选中态就
 *    没了。选中态（以及用户手动展开的用例）保存在 DOM / 旧 nodeData 上，
 *    重绘前抓下来、重绘后按节点 id 复原即可。
 *
 * 展开的用例贵得多（1.7ms vs 0.077ms，见 mindmap-budget.ts），所以复原展开
 * 态要受预算约束：超出的部分不恢复，并把条数报给调用方去提示用户。
 */
import type {
	MindElixirData,
	MindElixirInstance,
	NodeObj,
	Topic,
} from "mind-elixir";

import { isCaseNodeId } from "./mindmap-node-id.ts";
import { findTopic } from "./mindmap-node-utils.ts";

/** 重绘前后要保住的用户视图状态。 */
export interface MindmapViewState {
	/** 用户手动展开、露出步骤/预期的用例节点 id。 */
	expandedCaseIds: readonly string[];
	/** 当前选中的节点 id（支持多选）。 */
	selectedNodeIds: readonly string[];
}

export interface MindmapRedrawResult {
	/** 因超出预算而没能恢复展开的用例数；>0 时界面必须说明原因。 */
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

/** 从活着的实例上抓取选中态与展开态。 */
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

/**
 * 在新树上重新打开这些用例，最多 `limit` 条。纯函数（只改传入的新树，
 * 新树是 `toMindElixirData` 刚造出来的，不会外泄）。返回被舍弃的条数。
 */
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
		// 队友可能刚好删掉了选中的节点，或者它落进了折叠的子树里。
		if (topic !== null) {
			topics.push(topic);
		}
	}
	if (topics.length > 0) {
		mind.selectNodes(topics);
	}
}

/**
 * 用新数据重绘画布：跳过库内深拷贝，并复原选中态 / 用例展开态。
 * `expandedCaseAllowance` 来自 `planMindmapBudget`。
 */
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
