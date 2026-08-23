/**
 * mindmap.tree 的作用域裁剪：按模块取子树、按需剥离 steps。
 *
 * 纯函数，不做任何数据访问：模块行与用例行都由 packages/db 的 repository
 * 取好后传进来。裁剪放在这一层而不是 SQL 里，是因为 repository 目前只提供
 * 「按项目」的两个读接口，而本任务的收益（少传 steps、少传子树外的用例）
 * 落在响应载荷与前端库内深拷贝上，DB 侧的进一步收窄留给后续任务。
 */

import type { MindmapCaseNode } from "@automationstack/db/repositories/mindmap-repository";

import type { ModuleRow, ModuleTreeNode } from "./module-tree";
import { buildModuleTree } from "./module-tree";

export interface MindmapTreePayload {
	cases: MindmapCaseNode[];
	modules: ModuleTreeNode[];
}

export interface MindmapScopeInput {
	cases: MindmapCaseNode[];
	/** false 时用例节点的 steps 变成空数组（字段仍在，见 scopeMindmapTree）。 */
	includeSteps: boolean;
	/** null = 全项目（现有行为）；否则只保留该模块及其子孙。 */
	moduleId: string | null;
	moduleRows: ModuleRow[];
}

export type MindmapScopeResult =
	| { kind: "module-not-found" }
	| { kind: "ok"; payload: MindmapTreePayload };

/** 深度优先查找 moduleId 对应的子树根；不在这批行里则返回 null。 */
export function findModuleSubtree(
	roots: readonly ModuleTreeNode[],
	moduleId: string
): ModuleTreeNode | null {
	for (const root of roots) {
		if (root.id === moduleId) {
			return root;
		}
		const found = findModuleSubtree(root.children, moduleId);
		if (found !== null) {
			return found;
		}
	}
	return null;
}

/** 子树内所有模块 id（含根自身）。 */
export function collectModuleTreeIds(root: ModuleTreeNode): Set<string> {
	const ids = new Set<string>();
	const stack: ModuleTreeNode[] = [root];
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === undefined) {
			break;
		}
		if (ids.has(node.id)) {
			continue;
		}
		ids.add(node.id);
		stack.push(...node.children);
	}
	return ids;
}

/**
 * steps 置为空数组而不是删除字段：前端 adapter 的 MindmapCaseInput.steps 是
 * 必填的 CaseStep[]，toCaseNode 会直接 `caseInput.steps.map(...)`，字段缺失
 * 会当场抛 TypeError。空数组走的是「无步骤用例」这条已有分支（渲染成叶子，
 * 不画展开箭头），代价只有每条用例 `"steps":[]` 这几个字节。
 */
export function stripCaseSteps(
	cases: readonly MindmapCaseNode[]
): MindmapCaseNode[] {
	return cases.map((node) => ({ ...node, steps: [] }));
}

/** 只保留 moduleIds 里的用例，顺序沿用输入顺序（即 repository 的排序）。 */
export function filterCasesByModules(
	cases: readonly MindmapCaseNode[],
	moduleIds: ReadonlySet<string>
): MindmapCaseNode[] {
	return cases.filter((node) => moduleIds.has(node.moduleId));
}

/**
 * 裁剪出 mindmap.tree 的响应体。
 *
 * moduleId 为 null 且 includeSteps 为 true 时原样返回入参引用，
 * 保证不传新参数的响应与改动前逐字节一致。
 */
export function scopeMindmapTree(input: MindmapScopeInput): MindmapScopeResult {
	const roots = buildModuleTree(input.moduleRows);
	if (input.moduleId === null) {
		return {
			kind: "ok",
			payload: {
				cases: input.includeSteps ? input.cases : stripCaseSteps(input.cases),
				modules: roots,
			},
		};
	}
	const subtree = findModuleSubtree(roots, input.moduleId);
	if (subtree === null) {
		return { kind: "module-not-found" };
	}
	const scoped = filterCasesByModules(
		input.cases,
		collectModuleTreeIds(subtree)
	);
	return {
		kind: "ok",
		payload: {
			cases: input.includeSteps ? scoped : stripCaseSteps(scoped),
			modules: [subtree],
		},
	};
}
