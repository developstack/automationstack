/**
 * Bridges the `mindmap.tree` payload to the adapter input.
 *
 * `mindmap.tree` only returns modules + lightweight case nodes; the canvas root
 * additionally needs the project id/name, which come from `projects.get`.
 * Both shapes are derived from the router client so the contract stays in code.
 */
import type { client } from "@/utils/orpc";

import type { MindmapTreeInput } from "./mindmap-adapter.ts";

/** Exact `mindmap.tree` output. */
export type MindmapTreeData = Awaited<ReturnType<typeof client.mindmap.tree>>;

export type MindmapCaseRow = MindmapTreeData["cases"][number];
export type MindmapModuleRow = MindmapTreeData["modules"][number];

export interface MindmapProject {
	id: string;
	name: string;
}

/** True when the project has nothing to draw beyond the root node. */
export function isEmptyMindmapTree(tree: MindmapTreeData): boolean {
	return tree.modules.length === 0 && tree.cases.length === 0;
}

export function toMindmapTreeInput(
	project: MindmapProject,
	tree: MindmapTreeData
): MindmapTreeInput {
	return {
		cases: tree.cases,
		modules: tree.modules,
		projectId: project.id,
		projectName: project.name,
	};
}
