import type {
	MindmapCaseInput,
	MindmapModuleInput,
	MindmapTreeInput,
} from "./mindmap-adapter.ts";
import { sortByOrder } from "./mindmap-cache-order.ts";

export const MINDMAP_NODE_BUDGET = 1200;

export const EXPANDED_CASE_WEIGHT = 22;

export const MINDMAP_EXPANDED_CASE_RESERVE = 8;

const ROOT_NODE_COUNT = 1;

export interface MindmapBudgetPlan {
	expandDepth: number;
	expandedCaseAllowance: number;
	expandedModuleIds: ReadonlySet<string>;
	limited: boolean;
	renderedNodeCount: number;
	totalNodeCount: number;
}

function countCasesByModule(
	cases: readonly MindmapCaseInput[]
): ReadonlyMap<string, number> {
	const counts = new Map<string, number>();
	for (const caseNode of cases) {
		counts.set(caseNode.moduleId, (counts.get(caseNode.moduleId) ?? 0) + 1);
	}
	return counts;
}

function countModules(modules: readonly MindmapModuleInput[]): number {
	let total = modules.length;
	for (const module of modules) {
		total += countModules(module.children);
	}
	return total;
}

function expansionCost(
	module: MindmapModuleInput,
	casesByModule: ReadonlyMap<string, number>
): number {
	return module.children.length + (casesByModule.get(module.id) ?? 0);
}

interface GreedyState {
	casesByModule: ReadonlyMap<string, number>;
	expandDepth: number;
	expandedModuleIds: Set<string>;
	rendered: number;
}

function expandGreedily(
	roots: readonly MindmapModuleInput[],
	state: GreedyState,
	budget: number
): void {
	let frontier = sortByOrder(roots);
	let depth = 1;
	while (frontier.length > 0) {
		const next: MindmapModuleInput[] = [];
		for (const module of frontier) {
			const cost = expansionCost(module, state.casesByModule);
			if (state.rendered + cost <= budget) {
				state.expandedModuleIds.add(module.id);
				state.rendered += cost;
				state.expandDepth = Math.max(state.expandDepth, depth);
				next.push(...sortByOrder(module.children));
			}
		}
		frontier = next;
		depth += 1;
	}
}

export function planMindmapRender(
	input: MindmapTreeInput,
	budget: number = MINDMAP_NODE_BUDGET
): MindmapBudgetPlan {
	const casesByModule = countCasesByModule(input.cases);
	const state: GreedyState = {
		casesByModule,
		expandDepth: 0,
		expandedModuleIds: new Set<string>(),
		rendered: ROOT_NODE_COUNT + input.modules.length,
	};
	const reserve = MINDMAP_EXPANDED_CASE_RESERVE * EXPANDED_CASE_WEIGHT;
	expandGreedily(input.modules, state, Math.max(budget - reserve, 0));
	const moduleCount = countModules(input.modules);
	const totalNodeCount = ROOT_NODE_COUNT + moduleCount + input.cases.length;
	return {
		expandDepth: state.expandDepth,
		expandedCaseAllowance: Math.max(
			Math.floor((budget - state.rendered) / EXPANDED_CASE_WEIGHT),
			0
		),
		expandedModuleIds: state.expandedModuleIds,
		limited: state.expandedModuleIds.size < moduleCount,
		renderedNodeCount: state.rendered,
		totalNodeCount,
	};
}
