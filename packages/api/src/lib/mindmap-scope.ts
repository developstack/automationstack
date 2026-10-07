import type { MindmapCaseNode } from "@automationstack/db/repositories/mindmap-repository";

import type { ModuleRow, ModuleTreeNode } from "./module-tree";
import { buildModuleTree } from "./module-tree";

export interface MindmapTreePayload {
	cases: MindmapCaseNode[];
	modules: ModuleTreeNode[];
}

export interface MindmapScopeInput {
	cases: MindmapCaseNode[];
	includeSteps: boolean;
	moduleId: string | null;
	moduleRows: ModuleRow[];
}

export type MindmapScopeResult =
	| { kind: "module-not-found" }
	| { kind: "ok"; payload: MindmapTreePayload };

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

export function stripCaseSteps(
	cases: readonly MindmapCaseNode[]
): MindmapCaseNode[] {
	return cases.map((node) => ({ ...node, steps: [] }));
}

export function filterCasesByModules(
	cases: readonly MindmapCaseNode[],
	moduleIds: ReadonlySet<string>
): MindmapCaseNode[] {
	return cases.filter((node) => moduleIds.has(node.moduleId));
}

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
