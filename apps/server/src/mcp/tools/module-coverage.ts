import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import type { ModuleCoverageRow } from "@automationstack/db/repositories/project-stats-coverage";

export type ModuleGap = ModuleCoverageRow["gap"];

export interface FlatModule {
	activeCaseCount: number;
	caseCount: number;
	depth: number;
	gap: ModuleGap;
	id: string;
	name: string;
	parentId: string | null;
}

const UNKNOWN_COVERAGE = {
	activeCaseCount: 0,
	caseCount: 0,
	gap: "empty",
} as const;

function coverageOf(
	byModuleId: Map<string, ModuleCoverageRow>,
	moduleId: string
): { activeCaseCount: number; caseCount: number; gap: ModuleGap } {
	return byModuleId.get(moduleId) ?? UNKNOWN_COVERAGE;
}

function pushSubtree(
	nodes: ModuleTreeNode[],
	depth: number,
	byModuleId: Map<string, ModuleCoverageRow>,
	out: FlatModule[]
): void {
	for (const node of nodes) {
		const coverage = coverageOf(byModuleId, node.id);
		out.push({
			activeCaseCount: coverage.activeCaseCount,
			caseCount: coverage.caseCount,
			depth,
			gap: coverage.gap,
			id: node.id,
			name: node.name,
			parentId: node.parentId,
		});
		pushSubtree(node.children, depth + 1, byModuleId, out);
	}
}

export function flattenWithCoverage(
	tree: ModuleTreeNode[],
	coverage: ModuleCoverageRow[]
): FlatModule[] {
	const byModuleId = new Map(coverage.map((row) => [row.moduleId, row]));
	const out: FlatModule[] = [];
	pushSubtree(tree, 0, byModuleId, out);
	return out;
}

function gapSuffix(gap: ModuleGap): string {
	if (gap === "empty") {
		return " ← 零用例";
	}
	if (gap === "no-active") {
		return " ← 无 active 用例";
	}
	return "";
}

export function renderOutline(flat: FlatModule[]): string {
	if (flat.length === 0) {
		return "(project has no modules yet)";
	}
	return flat
		.map((row) => {
			const indent = "  ".repeat(row.depth);
			const counts = `${row.caseCount} cases / ${row.activeCaseCount} active`;
			return `${indent}- ${row.name} (id: ${row.id}, ${counts})${gapSuffix(row.gap)}`;
		})
		.join("\n");
}
