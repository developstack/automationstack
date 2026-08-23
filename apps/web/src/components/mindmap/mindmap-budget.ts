/**
 * 脑图渲染预算护栏。
 *
 * 进 DOM 的节点数 = 1（项目根）+ 展开子树里的模块数 + 展开模块下的用例数。
 * 折叠的子树不进 DOM —— mind-elixir 的 `createWrapper` 只在
 * `e.expanded !== false` 时才递归渲染 children（MindElixir.js:381-385），
 * 所以折叠掉的用例连同它的步骤/预期子节点都是零成本。
 *
 * 两条独立的护栏，缺一不可：
 *
 * 1. **节点数**：`refresh()` 的 layout + linkDiv 是 O(节点数)。超预算时按
 *    「广度优先、逐个模块」收窄展开范围：同一层的模块先都展开，再往下一层
 *    走，预算用完的模块改为折叠渲染。收窄的手段只能是折叠、不能是砍数据 ——
 *    砍掉的节点用户再也点不出来，折叠则留着 `+`。
 *    这条规则天然兼顾了第二级护栏：模块本身就撑满预算时，深层模块一个都
 *    展不开，画面自动退化成「只展开到一级/二级模块」，不需要额外分支。
 *
 * 2. **同时展开的用例数**：展开的用例约 1.7ms/条，折叠的约 0.077ms/条
 *    （T15 实测，贵 22 倍：步骤文本长、layout 测量贵、还多一层 sub-branch
 *    SVG）。1000 条用例的项目里展开 15 条，节点数只涨 6.7%，`refresh()`
 *    却涨 33%。所以护栏不能只数节点：展开的用例按 22 个折叠节点计价，
 *    剩余预算换算成「还能同时展开几条用例」。这份额度必须先预留、
 *    再让模块贪心去花剩下的，否则大项目里额度会被挤成 0。
 */
import type {
	MindmapCaseInput,
	MindmapModuleInput,
	MindmapTreeInput,
} from "./mindmap-adapter.ts";
import { sortByOrder } from "./mindmap-cache-order.ts";

/** 肉眼可感的 `refresh()`（>50ms）大约从 660 条用例开始；1200 留一档余量。 */
export const MINDMAP_NODE_BUDGET = 1200;

/** 一条展开的用例折算成多少个折叠节点（1.7ms ÷ 0.077ms ≈ 22）。 */
export const EXPANDED_CASE_WEIGHT = 22;

/**
 * 给「用户手动展开的用例」预留的条数，从模块预算里先扣掉。
 *
 * 没有这条预留，贪心展开会把 1200 的预算全花在模块和用例标题上
 * （实测 2000 条用例的项目 renderedNodeCount = 1199），
 * `expandedCaseAllowance` 归零 —— 于是队友每保存一次，用户自己点开的
 * 步骤就全被收起来，这正是本次要修的干扰问题换了个形式再现。
 */
export const MINDMAP_EXPANDED_CASE_RESERVE = 8;

/** 项目根节点自己也占一个 DOM 节点。 */
const ROOT_NODE_COUNT = 1;

export interface MindmapBudgetPlan {
	/** 已展开模块的最大深度（一级模块为 1）；0 表示一级模块也全折叠。 */
	expandDepth: number;
	/** 在当前预算下还能同时展开几条用例（含步骤/预期子节点）。 */
	expandedCaseAllowance: number;
	/** 展开渲染的模块 id；不在其中的模块折叠，子树不进 DOM。 */
	expandedModuleIds: ReadonlySet<string>;
	/** 是否因为预算收窄了展开范围（true 时界面必须给出说明）。 */
	limited: boolean;
	/** 本次实际进 DOM 的节点数。 */
	renderedNodeCount: number;
	/** 全部展开时的节点数。 */
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

/** 展开一个模块要新增的 DOM 节点数：它的子模块 + 它自己的用例。 */
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

/**
 * 广度优先地花预算：同一层里按 sortOrder 依次尝试展开，装不下的模块折叠。
 * 逐个（而不是逐层）决策才能把预算用满 —— 逐层是全有全无的，
 * 48 个模块 2000 条用例的项目会一条用例都不展开，白白浪费一千多个节点额度。
 */
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

/** 从画布输入算出渲染计划。纯函数，界面提示与画布必须用同一份结果。 */
export function planMindmapRender(
	input: MindmapTreeInput,
	budget: number = MINDMAP_NODE_BUDGET
): MindmapBudgetPlan {
	const casesByModule = countCasesByModule(input.cases);
	const state: GreedyState = {
		casesByModule,
		expandDepth: 0,
		expandedModuleIds: new Set<string>(),
		// 项目根永远展开，所以一级模块无条件进 DOM。
		rendered: ROOT_NODE_COUNT + input.modules.length,
	};
	// 先扣掉展开用例的预留额度，剩下的才交给模块贪心去花。
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
		// 每个模块都展开了就没有藏起来的东西。不能拿 rendered < total 判断：
		// 用例列表里若混进了模块树上不存在的 moduleId（孤儿用例），
		// total 会虚高，小项目也会被误报成「超预算」。
		limited: state.expandedModuleIds.size < moduleCount,
		renderedNodeCount: state.rendered,
		totalNodeCount,
	};
}
