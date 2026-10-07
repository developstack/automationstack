import type { client } from "@/utils/orpc";

import type { MindmapTreeInput } from "./mindmap-adapter.ts";

export type MindmapTreeData = Awaited<ReturnType<typeof client.mindmap.tree>>;

export type MindmapCaseRow = MindmapTreeData["cases"][number];
export type MindmapModuleRow = MindmapTreeData["modules"][number];

export interface MindmapProject {
	id: string;
	name: string;
}

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
